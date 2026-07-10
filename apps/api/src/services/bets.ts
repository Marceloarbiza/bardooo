import { createHash } from "node:crypto";
import { prisma, type Tx } from "../db";
import { ApiError, errors } from "../errors";
import { computeResolution, computeClaimPayout } from "../settlement";
import { accreditIfPending } from "./referrals";
import { getKnobs } from "./config";

/*  Reglas duras que este servicio hace cumplir EN EL SERVER (el cliente jamás
    valida solo): lado único, mín/fijo/tope, saldo, estado, ventana de tiempo,
    código de privadas hasheado, relámpago con deadline fijo cierre+30min.     */

const FLASH_DEADLINE_MIN = 30; // relámpago: cierre + 30 min o se anula
const GRACE_HOURS = 4; // paridad con el contrato: sin resultado tras resolveTime + 4h → anulación
const MAX_QUESTION = 200;

/* ---- garantía del creador (anti-bots + juez con skin in the game) ----
   Se retiene al crear (si la perilla bondPts > 0), VUELVE al resolver o al
   cancelar sin culpa, y SE PIERDE por abandono (treasury: en puntos es el
   sink de la plataforma — el débito original queda como registro).        */

/** Cupo de creaciones por cuenta/día (perilla; 0 = sin límite). Cuenta pts y
 *  usdc juntos (los espejos no: los crea el sistema). */
export async function assertCreateQuota(userId: string) {
  const { createsPerDay } = await getKnobs();
  if (createsPerDay <= 0) return;
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const n = await prisma.bet.count({
    where: { creatorId: userId, createdAt: { gte: since }, mirrorOfId: null },
  });
  if (n >= createsPerDay)
    throw new ApiError(429, "CREATE_LIMIT", `Llegaste al tope de ${createsPerDay} duelos por día. Mañana hay más`);
}

async function refundBondTx(tx: Tx, b: { id: number; creatorId: string; bondAmount: number }) {
  if (b.bondAmount <= 0) return;
  await tx.user.update({ where: { id: b.creatorId }, data: { points: { increment: b.bondAmount } } });
  await tx.pointsLedger.create({
    data: { userId: b.creatorId, delta: b.bondAmount, reason: "garantia", ref: `bet:${b.id}:devolucion` },
  });
}

export const hashCode = (code: string) =>
  createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

type BetWithAll = NonNullable<Awaited<ReturnType<typeof findBet>>>;

function findBet(id: number) {
  return prisma.bet.findUnique({
    where: { id },
    include: { stakes: true, creator: { select: { id: true, name: true, handle: true } } },
  });
}

/* ---------------- serialización (lo que ve el front) ---------------- */
/* El código de las privadas JAMÁS sale de acá: solo `hasCode`.
   Los duelos usdc se guardan en MICRO-unidades: acá salen en unidades de
   pantalla (÷1e6), así el front usa la misma matemática para todo.       */
export function serializeBet(b: BetWithAll, forUserId?: string, now = Date.now()) {
  const unit = b.currency === "usdc" ? 1e6 : 1;
  const pools: [number, number] = [0, 0];
  const myStake: [number, number] = [0, 0];
  let settledMine = false;
  for (const s of b.stakes) {
    pools[s.option] += s.amount / unit;
    if (forUserId && s.userId === forUserId) {
      myStake[s.option] += s.amount / unit;
      settledMine = s.settled;
    }
  }
  return {
    id: b.id,
    question: b.question,
    currency: b.currency,
    stakeMode: b.stakeMode,
    fixedAmount: b.fixedAmount === null ? null : b.fixedAmount / unit,
    minStake: b.minStake / unit,
    maxStake: b.maxStake / unit,
    maxBettors: b.maxBettors,
    creatorBps: b.creatorBps,
    platformBps: b.platformBps,
    feeBps: b.platformBps + b.creatorBps, // total que sale del pozo (congelado al crear)
    closeTime: b.closeTime.getTime(),
    resolveTime: b.resolveTime.getTime(),
    status: deriveStatus(b, now),
    winningOption: b.winningOption,
    isPrivate: b.isPrivate,
    hasCode: !!b.codeHash,
    relampago: b.relampago,
    launch: b.launch.getTime(),
    deadline: b.deadline?.getTime() ?? null,
    chainAddress: b.chainAddress, // duelos usdc: el front escribe contra este contrato
    mirrorOfId: b.mirrorOfId,
    pools,
    bettors: b.stakes.length,
    creator: { name: b.creator.name, handle: b.creator.handle, mine: b.creator.id === forUserId },
    myStake,
    claimed: settledMine,
  };
}

/** open→locked (y relámpago pts vencido→cancelled) se derivan por tiempo al
 *  leer. El cron materializa la anulación (con refunds) hasta un minuto
 *  después. Los usdc solo cambian de estado por eventos de la cadena
 *  (lockedAt refleja lockBetting() on-chain).                              */
function deriveStatus(
  b: { status: string; closeTime: Date; relampago: boolean; deadline: Date | null; lockedAt: Date | null },
  now: number
): "open" | "locked" | "resolved" | "cancelled" {
  if (b.status !== "open") return b.status as "resolved" | "cancelled";
  if (b.relampago && b.deadline && now > b.deadline.getTime()) return "cancelled";
  if (b.lockedAt || now >= b.closeTime.getTime()) return "locked";
  return "open";
}

/* ---------------- listar / ver ---------------- */

export async function listPublicBets(forUserId?: string) {
  const bets = await prisma.bet.findMany({
    where: { isPrivate: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { stakes: true, creator: { select: { id: true, name: true, handle: true } } },
  });
  return bets.map((b) => serializeBet(b, forUserId));
}

/** Las privadas son NO LISTADAS: se accede por link directo. Si además tienen
 *  código, solo entra el creador / quien ya apostó / quien lo desbloquea. */
export async function getBet(id: number, forUserId?: string, code?: string) {
  const b = await findBet(id);
  if (!b) throw errors.notFound();
  if (b.isPrivate && b.codeHash) {
    const isCreator = forUserId && b.creator.id === forUserId;
    const hasStake = forUserId && b.stakes.some((s) => s.userId === forUserId);
    if (!isCreator && !hasStake) {
      if (code === undefined) throw errors.needsCode();
      if (hashCode(code) !== b.codeHash) throw errors.wrongCode();
    }
  }
  return serializeBet(b, forUserId);
}

/* ---------------- crear ---------------- */

export interface CreateBetInput {
  question: string;
  currency: "pts" | "usdc";
  stakeMode: "free" | "fixed" | "capped";
  fixedAmount?: number;
  minStake?: number;
  maxStake?: number;
  maxBettors?: number;
  creatorBps?: number; // DEPRECADO: se ignora — la comisión es fija (7% / 9% flash)
  isPrivate?: boolean;
  code?: string;
  // modo completo (ms epoch):
  closeTime?: number;
  resolveTime?: number;
  // relámpago: el SERVER fija los tiempos (anti-manipulación)
  relampago?: boolean;
  windowMin?: number;
}

export async function createBet(userId: string, input: CreateBetInput) {
  // sin caracteres de control ni saltos raros: la pregunta es texto plano
  const q = input.question.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 7 || q.length > MAX_QUESTION)
    throw new ApiError(400, "BAD_QUESTION", "La pregunta tiene que tener entre 7 y 200 caracteres");
  if (input.currency === "usdc") throw errors.usdcSoon(); // fase 3
  // comisión FIJA: el cliente no la elige (decisión del dueño 2026-07-05);
  // el split flash (1/9) lo aplica la liquidación según bet.relampago

  const minStake = Math.max(1, Math.trunc(input.minStake ?? 5));
  let fixedAmount: number | null = null;
  if (input.stakeMode === "fixed") {
    fixedAmount = Math.trunc(input.fixedAmount ?? 0);
    if (fixedAmount < minStake) throw new ApiError(400, "BAD_FIXED", "El monto fijo no puede ser menor al mínimo");
  }
  let maxStake = 0;
  if (input.stakeMode === "capped") {
    maxStake = Math.trunc(input.maxStake ?? 0);
    if (maxStake < minStake) throw new ApiError(400, "BAD_CAP", "El tope no puede ser menor al mínimo");
  }

  const now = Date.now();
  let closeTime: number, resolveTime: number, deadline: number | null = null;
  const relampago = !!input.relampago;
  if (relampago) {
    const windowMin = Math.trunc(input.windowMin ?? 15);
    if (windowMin < 5 || windowMin > 60)
      throw new ApiError(400, "BAD_WINDOW", "La ventana del relámpago va de 5 a 60 minutos");
    closeTime = now + windowMin * 60000;
    resolveTime = closeTime + 1000; // espejo del contrato: closeTime < resolveTime
    deadline = closeTime + FLASH_DEADLINE_MIN * 60000;
  } else {
    closeTime = Math.trunc(input.closeTime ?? NaN);
    resolveTime = Math.trunc(input.resolveTime ?? NaN);
    if (!Number.isFinite(closeTime) || closeTime <= now)
      throw new ApiError(400, "BAD_TIME", "El evento es muy pronto: el cierre ya pasó");
    if (!Number.isFinite(resolveTime) || resolveTime <= closeTime)
      throw new ApiError(400, "BAD_TIME", "El resultado tiene que ser después del cierre");
  }

  const isPrivate = !!input.isPrivate;
  const code = (input.code ?? "").trim();
  if (code && code.length > 12) throw new ApiError(400, "BAD_CODE", "El código va hasta 12 caracteres");

  await assertCreateQuota(userId); // perilla de cupo (0 = sin límite)
  const knobs = await getKnobs(); // garantía + comisiones vigentes
  const { bondPts } = knobs;
  // los bps se CONGELAN acá (como la factory): el flash nace con su split 1/9
  const platformBps = relampago ? knobs.flashPlatformBps : knobs.platformBps;
  const creatorBps = relampago ? knobs.flashCreatorBps : knobs.creatorBps;

  const bet = await prisma.$transaction(async (tx) => {
    // la garantía se retiene ATOMICAMENTE con la creación (si la perilla está prendida)
    if (bondPts > 0) {
      const debit = await tx.user.updateMany({
        where: { id: userId, points: { gte: bondPts } },
        data: { points: { decrement: bondPts } },
      });
      if (debit.count === 0)
        throw new ApiError(400, "BOND_POINTS", `Crear un duelo retiene ${bondPts} pts de garantía (te vuelven al resolver) y no te alcanzan`);
    }

    const created = await tx.bet.create({
      data: {
        creatorId: userId,
        question: q,
        currency: "pts",
        stakeMode: input.stakeMode,
        fixedAmount,
        minStake,
        maxStake,
        maxBettors: Math.max(0, Math.trunc(input.maxBettors ?? 0)),
        platformBps,
        creatorBps,
        bondAmount: bondPts,
        closeTime: new Date(closeTime),
        resolveTime: new Date(resolveTime),
        isPrivate,
        codeHash: isPrivate && code ? hashCode(code) : null,
        relampago,
        launch: new Date(now),
        deadline: deadline ? new Date(deadline) : null,
      },
      include: { stakes: true, creator: { select: { id: true, name: true, handle: true } } },
    });

    if (bondPts > 0) {
      await tx.pointsLedger.create({
        data: { userId, delta: -bondPts, reason: "garantia", ref: `bet:${created.id}` },
      });
    }
    return created;
  });

  // NOTA espejo (fase 3): si el creador tiene walletAddr, acá nace también el
  // gemelo USDC on-chain y este bet de puntos lleva mirrorOfId. En fase 2 no hay
  // wallets, así que el duelo sale solo en puntos.

  if (!isPrivate) {
    await prisma.activity.create({
      data: { type: "bet_created", userHandle: bet.creator.handle, betId: bet.id, currency: "pts" },
    });
  }

  return serializeBet(bet, userId);
}

/* ---------------- apostar ---------------- */

export async function placeBet(userId: string, betId: number, option: number, amount: number) {
  if (option !== 0 && option !== 1) throw new ApiError(400, "BAD_OPTION", "La opción es SÍ o NO");
  amount = Math.trunc(amount);
  if (!Number.isFinite(amount) || amount < 1) throw new ApiError(400, "BAD_AMOUNT", "Monto inválido");

  return prisma.$transaction(async (tx) => {
    const b = await tx.bet.findUnique({ where: { id: betId }, include: { stakes: true } });
    if (!b) throw errors.notFound();
    if (b.currency === "usdc") throw errors.chainOnly(); // se apuesta desde la wallet, no por API
    // misma regla que el contrato: el juez no apuesta en su propio pozo
    if (b.creatorId === userId) throw errors.creatorCannotBet();
    const now = Date.now();

    // estado y ventana (validación de SERVER, como el contrato)
    const st = deriveStatus(b, now);
    if (st === "cancelled" || st === "resolved") throw errors.badState();
    if (now >= b.closeTime.getTime()) throw errors.betClosed();

    const mine = b.stakes.find((s) => s.userId === userId);

    // un solo lado por usuario
    if (mine && mine.option !== option) throw errors.otherSide(mine.option === 1 ? "SÍ" : "NO");

    // modos de monto
    if (b.stakeMode === "fixed") {
      if (amount !== b.fixedAmount) throw errors.wrongAmount(`${b.fixedAmount} pts`);
    } else {
      if (amount < b.minStake) throw errors.belowMin(`${b.minStake} pts`);
      if (b.stakeMode === "capped" && (mine?.amount ?? 0) + amount > b.maxStake)
        throw errors.overCap(`${b.maxStake} pts`);
    }

    // tope TOTAL de apostadores (nunca por lado)
    if (!mine && b.maxBettors > 0 && b.stakes.length >= b.maxBettors) throw errors.betFull();

    // débito atómico: si no alcanza el saldo, no toca nada
    const debit = await tx.user.updateMany({
      where: { id: userId, points: { gte: amount } },
      data: { points: { decrement: amount } },
    });
    if (debit.count === 0) throw errors.noPoints();

    await tx.pointsLedger.create({
      data: { userId, delta: -amount, reason: "apuesta", ref: `bet:${betId}` },
    });

    if (mine) {
      await tx.stake.update({ where: { id: mine.id }, data: { amount: { increment: amount } } });
    } else {
      await tx.stake.create({ data: { userId, betId, option, amount } });
    }

    if (!b.isPrivate) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { handle: true } });
      await tx.activity.create({
        data: { type: "bet_placed", userHandle: user.handle, betId, amount, side: option, currency: "pts" },
      });
    }

    await accreditIfPending(tx, userId); // primera acción real → acredita al referidor

    const fresh = await tx.bet.findUniqueOrThrow({
      where: { id: betId },
      include: { stakes: true, creator: { select: { id: true, name: true, handle: true } } },
    });
    return serializeBet(fresh, userId);
  });
}

/* ---------------- resolver (liquida en UNA transacción) ---------------- */

export async function resolveBet(userId: string, betId: number, option: number) {
  if (option !== 0 && option !== 1) throw new ApiError(400, "BAD_OPTION", "La opción es SÍ o NO");

  return prisma.$transaction(async (tx) => {
    const b = await tx.bet.findUnique({ where: { id: betId }, include: { stakes: true } });
    if (!b) throw errors.notFound();
    if (b.currency === "usdc") throw errors.chainOnly(); // se resuelve on-chain; el espejo lo sigue
    if (b.creatorId !== userId) throw errors.notCreator();
    if (b.status !== "open") throw errors.badState();
    const now = Date.now();
    if (now < b.resolveTime.getTime()) throw errors.tooEarly();

    // relámpago vencido: ya no se puede resolver — se anula por ABANDONO
    // (la garantía NO vuelve: se pierde al treasury)
    if (b.relampago && b.deadline && now > b.deadline.getTime()) {
      await cancelWithRefunds(tx, b.id, b.stakes);
      return { cancelled: true as const };
    }

    const r = computeResolution(
      { platformBps: b.platformBps, creatorBps: b.creatorBps },
      b.stakes.map((s) => ({ userId: s.userId, option: s.option, amount: s.amount })),
      option
    );

    if (r.kind === "cancelled") {
      await cancelWithRefunds(tx, b.id, b.stakes);
      await refundBondTx(tx, b); // anulación SIN culpa (sin contraparte): garantía devuelta
      return { cancelled: true as const };
    }

    await tx.bet.update({
      where: { id: b.id },
      data: { status: "resolved", winningOption: option, dust: r.dust },
    });
    await refundBondTx(tx, b); // el juez resolvió: su garantía vuelve

    // comisión del creador: se acredita YA (la de plataforma en puntos es un sink auditable via dust+ledger)
    if (r.creatorCut > 0) {
      await tx.user.update({ where: { id: b.creatorId }, data: { points: { increment: r.creatorCut } } });
      await tx.pointsLedger.create({
        data: { userId: b.creatorId, delta: r.creatorCut, reason: "comision", ref: `bet:${b.id}` },
      });
    }

    if (!b.isPrivate) {
      const creator = await tx.user.findUniqueOrThrow({ where: { id: b.creatorId }, select: { handle: true } });
      await tx.activity.create({
        data: { type: "resolved", userHandle: creator.handle, betId: b.id, side: option, currency: "pts" },
      });
    }

    return { cancelled: false as const, creatorCut: r.creatorCut, platformCut: r.platformCut };
  });
}

/* ---------------- cobrar (pull, espejo del contrato) ---------------- */

export async function claimBet(userId: string, betId: number) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.bet.findUnique({ where: { id: betId }, include: { stakes: true } });
    if (!b) throw errors.notFound();
    if (b.currency === "usdc") throw errors.chainOnly(); // se cobra on-chain (pull del contrato)
    if (b.status !== "resolved" || b.winningOption === null) throw errors.badState();

    const mine = b.stakes.find((s) => s.userId === userId);
    if (!mine || mine.option !== b.winningOption) throw errors.nothingToClaim();
    if (mine.settled) throw errors.alreadySettled();

    const pay = computeClaimPayout(
      b.stakes.map((s) => ({ userId: s.userId, option: s.option, amount: s.amount })),
      b.winningOption,
      userId,
      b.platformBps + b.creatorBps
    );
    if (pay <= 0) throw errors.nothingToClaim();

    await tx.stake.update({ where: { id: mine.id }, data: { settled: true } });
    await tx.user.update({ where: { id: userId }, data: { points: { increment: pay } } });
    await tx.pointsLedger.create({
      data: { userId, delta: pay, reason: "premio", ref: `bet:${betId}` },
    });

    if (!b.isPrivate) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { handle: true } });
      await tx.activity.create({
        data: { type: "claimed", userHandle: user.handle, betId, amount: pay, side: b.winningOption, currency: "pts" },
      });
    }

    return { pay };
  });
}

/* ---------------- anulación con devolución automática ----------------
   En puntos no hay gas: al cancelar se devuelve TODO a TODOS en la misma
   transacción (a diferencia del contrato, donde cada uno hace pull). El
   endpoint /refund queda como red de seguridad para stakes sin settled.  */

async function cancelWithRefunds(
  tx: Tx,
  betId: number,
  stakes: { id: number; userId: string; amount: number; settled: boolean }[]
) {
  await tx.bet.update({ where: { id: betId }, data: { status: "cancelled" } });
  for (const s of stakes) {
    if (s.settled || s.amount <= 0) continue;
    await tx.stake.update({ where: { id: s.id }, data: { settled: true } });
    await tx.user.update({ where: { id: s.userId }, data: { points: { increment: s.amount } } });
    await tx.pointsLedger.create({
      data: { userId: s.userId, delta: s.amount, reason: "refund", ref: `bet:${betId}` },
    });
  }
}

/** El creador anula (empate / evento suspendido). Devuelve todo, sin comisión.
 *  Cancelar dando la cara NO es abandono: la garantía vuelve. */
export async function cancelBet(userId: string, betId: number) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.bet.findUnique({ where: { id: betId }, include: { stakes: true } });
    if (!b) throw errors.notFound();
    if (b.creatorId !== userId) throw errors.notCreator();
    if (b.status !== "open") throw errors.badState();
    await cancelWithRefunds(tx, b.id, b.stakes);
    await refundBondTx(tx, b);
    return { cancelled: true };
  });
}

/** Red de seguridad: reclama una devolución que no se acreditó (no debería pasar). */
export async function refundBet(userId: string, betId: number) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.bet.findUnique({ where: { id: betId }, include: { stakes: true } });
    if (!b) throw errors.notFound();
    if (b.currency === "usdc") throw errors.chainOnly(); // refund() se llama on-chain
    if (b.status !== "cancelled") throw errors.badState();
    const mine = b.stakes.find((s) => s.userId === userId);
    if (!mine || mine.amount <= 0) throw errors.nothingToClaim();
    if (mine.settled) throw errors.alreadySettled();
    await tx.stake.update({ where: { id: mine.id }, data: { settled: true } });
    await tx.user.update({ where: { id: userId }, data: { points: { increment: mine.amount } } });
    await tx.pointsLedger.create({
      data: { userId, delta: mine.amount, reason: "refund", ref: `bet:${betId}` },
    });
    return { refunded: mine.amount };
  });
}

/* ---------------- espejo: resoluciones disparadas por la CADENA ----------------
   El indexer llama esto cuando el duelo usdc gemelo se resuelve/cancela
   on-chain: la acción del creador es UNA sola (en la cadena) y el gemelo de
   puntos la sigue solo. Sin chequeos de creador ni de tiempos: la cadena ya
   es la autoridad.                                                            */

export async function systemResolveBet(betId: number, option: number) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.bet.findUnique({ where: { id: betId }, include: { stakes: true } });
    if (!b || b.status !== "open") return null; // ya liquidado: idempotente

    const r = computeResolution(
      { platformBps: b.platformBps, creatorBps: b.creatorBps },
      b.stakes.map((s) => ({ userId: s.userId, option: s.option, amount: s.amount })),
      option
    );

    if (r.kind === "cancelled") {
      await cancelWithRefunds(tx, b.id, b.stakes);
      await refundBondTx(tx, b); // sin contraparte: sin culpa del juez
      return { cancelled: true as const };
    }

    await tx.bet.update({
      where: { id: b.id },
      data: { status: "resolved", winningOption: option, dust: r.dust },
    });
    await refundBondTx(tx, b); // resolvió: la garantía vuelve
    if (r.creatorCut > 0) {
      await tx.user.update({ where: { id: b.creatorId }, data: { points: { increment: r.creatorCut } } });
      await tx.pointsLedger.create({
        data: { userId: b.creatorId, delta: r.creatorCut, reason: "comision", ref: `bet:${b.id}` },
      });
    }
    return { cancelled: false as const, creatorCut: r.creatorCut };
  });
}

export async function systemCancelBet(betId: number) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.bet.findUnique({ where: { id: betId }, include: { stakes: true } });
    if (!b || b.status !== "open") return null;
    await cancelWithRefunds(tx, b.id, b.stakes);
    await refundBondTx(tx, b); // cancelación de sistema/espejo: no es abandono del juez
    return { cancelled: true };
  });
}

/* ---------------- cron: relámpagos vencidos ---------------- */

/** Anula (y devuelve) los duelos de puntos ABANDONADOS: relámpagos con el
 *  deadline vencido y duelos comunes sin resolver tras resolveTime + 4h de
 *  gracia (paridad con la válvula del contrato). La garantía del creador NO
 *  se devuelve: abandono = garantía al treasury. Corre cada minuto. */
export async function expireOverdueRelampagos(now = Date.now()) {
  const overdue = await prisma.bet.findMany({
    where: {
      currency: "pts",
      status: "open",
      mirrorOfId: null, // los gemelos-espejo siguen SOLO a la cadena (jamás al reloj del server)
      OR: [
        { relampago: true, deadline: { lt: new Date(now) } },
        { relampago: false, resolveTime: { lt: new Date(now - GRACE_HOURS * 3600 * 1000) } },
      ],
    },
    include: { stakes: true },
    take: 100,
  });
  for (const b of overdue) {
    await prisma.$transaction(async (tx) => {
      // re-chequeo dentro de la tx (pudo resolverse en el medio)
      const fresh = await tx.bet.findUniqueOrThrow({ where: { id: b.id }, include: { stakes: true } });
      if (fresh.status !== "open") return;
      await cancelWithRefunds(tx, fresh.id, fresh.stakes); // los apostadores recuperan TODO
      // la garantía del creador NO vuelve: eso es el castigo por abandonar
    });
  }
  return overdue.length;
}
