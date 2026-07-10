import { createPublicClient, http, getAddress, type Log } from "viem";
import { AMOY, BET_FACTORY_ABI, BET_ABI } from "@bardooo/core";
import { prisma } from "./db";
import { systemResolveBet, systemCancelBet } from "./services/bets";

/*  INDEXER (fase 3): la cadena es la fuente de verdad de los duelos usdc;
    esto la refleja en la DB cada ~5 s para que feed, ticker, pozos y el
    ESPEJO de puntos salgan de un solo lugar (la API).
    - BetCreated  → fila Bet usdc (+ gemelo pts si el creador es usuario de la app)
    - BetPlaced   → Stake (micro-unidades) + Activity (late el ticker)
    - Resolved    → status + ESPEJO: resuelve el gemelo pts automáticamente
    - Cancelled   → status + espejo cancelado (refunds de pts automáticos)
    - Claimed     → stake settled + Activity
    - LockedEvent → lockedAt (el creador cerró antes con lockBetting())
    Idempotente: re-procesar un rango no duplica nada (upserts + unique).      */

const FLASH_DEADLINE_MIN = 30;
const MAX_RANGE = 10_000n; // dRPC banca rangos grandes; el RPC oficial no (<900)

const client = createPublicClient({
  transport: http(process.env.AMOY_RPC_URL ?? AMOY.rpcUrl),
});

const factoryEvents = BET_FACTORY_ABI.filter((x) => x.type === "event");
const betEvents = BET_ABI.filter((x) => x.type === "event");

/* ------------------------- usuarios por wallet ------------------------- */
/** Usuario de la app si la wallet está vinculada; si no, usuario "sombra"
 *  (handle @0xabc123) para que la UI muestre quién apostó. Sin bienvenida. */
export async function getOrCreateUserByWallet(addr: string) {
  const wallet = getAddress(addr); // checksum canónico
  const existing = await prisma.user.findFirst({
    where: { walletAddr: { equals: wallet, mode: "insensitive" } },
  });
  if (existing) return existing;

  const base = wallet.slice(2, 8).toLowerCase();
  for (let i = 0; i < 20; i++) {
    try {
      return await prisma.user.create({
        data: {
          privyId: `wallet:${wallet.toLowerCase()}`,
          name: wallet.slice(0, 6) + "…" + wallet.slice(-4),
          handle: "@" + (i === 0 ? base : `${base}${i + 1}`),
          walletAddr: wallet,
          points: 0,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        const again = await prisma.user.findUnique({ where: { privyId: `wallet:${wallet.toLowerCase()}` } });
        if (again) return again;
        continue;
      }
      throw e;
    }
  }
  throw new Error("no pude crear usuario sombra");
}

/* --------------------------- handlers de eventos --------------------------- */

const STAKE_MODES = ["fixed", "free", "capped"] as const; // enum StakeMode del contrato

export async function onChainBetCreated(betAddr: string, creatorAddr: string) {
  const chainAddress = getAddress(betAddr);
  const exists = await prisma.bet.findUnique({ where: { chainAddress } });
  if (exists) return exists;

  // la config vive en el contrato: se lee una vez al materializar
  const cfg = (await client.readContract({
    address: chainAddress,
    abi: BET_ABI,
    functionName: "config",
  })) as readonly [string, number, number, bigint, bigint, bigint, bigint, bigint, bigint, boolean];
  const [description, , stakeMode, fixedAmount, maxStake, minStake, maxBettors, closeTime, resolveTime, isFlash] = cfg;

  // los bps CONGELADOS en el contrato (la factory los inyectó al crear):
  // la DB refleja la economía real de la cadena, no una constante local
  const [chainPlatformBps, chainCreatorBps] = (await Promise.all([
    client.readContract({ address: chainAddress, abi: BET_ABI, functionName: "platformFeeBps" }),
    client.readContract({ address: chainAddress, abi: BET_ABI, functionName: "creatorFeeBps" }),
  ])) as [number, number];

  const creator = await getOrCreateUserByWallet(creatorAddr);

  const usdcBet = await prisma.bet.create({
    data: {
      creatorId: creator.id,
      question: description,
      currency: "usdc",
      stakeMode: STAKE_MODES[stakeMode] ?? "free",
      fixedAmount: stakeMode === 0 ? Number(fixedAmount) : null, // micro-unidades
      minStake: Number(minStake),
      maxStake: Number(maxStake),
      maxBettors: Number(maxBettors),
      platformBps: Number(chainPlatformBps),
      creatorBps: Number(chainCreatorBps),
      closeTime: new Date(Number(closeTime) * 1000), // ¡el contrato usa segundos!
      resolveTime: new Date(Number(resolveTime) * 1000),
      relampago: isFlash,
      deadline: null, // en la cadena la válvula es el grace de 4 h, no los 30 min
      chainAddress,
    },
  });

  await prisma.activity.create({
    data: { type: "bet_created", userHandle: creator.handle, betId: usdcBet.id, currency: "usdc" },
  });

  // ESPEJO: si el creador es usuario de la app (no sombra), el duelo sale
  // TAMBIÉN en puntos — dos pozos gemelos y separados, jamás mezclados.
  if (!creator.privyId.startsWith("wallet:")) {
    const closeMs = Number(closeTime) * 1000;
    const twin = await prisma.bet.create({
      data: {
        creatorId: creator.id,
        question: description,
        currency: "pts",
        stakeMode: STAKE_MODES[stakeMode] ?? "free",
        // unidades 1:1 → 5 USDC se espeja como 5 pts
        fixedAmount: stakeMode === 0 ? Math.max(1, Math.round(Number(fixedAmount) / 1e6)) : null,
        minStake: Math.max(1, Math.round(Number(minStake) / 1e6)),
        maxStake: Math.round(Number(maxStake) / 1e6),
        maxBettors: Number(maxBettors),
        // el gemelo pts hereda la economía EXACTA del duelo on-chain
        platformBps: Number(chainPlatformBps),
        creatorBps: Number(chainCreatorBps),
        closeTime: new Date(closeMs),
        resolveTime: new Date(Number(resolveTime) * 1000),
        relampago: isFlash,
        deadline: isFlash ? new Date(closeMs + FLASH_DEADLINE_MIN * 60000) : null,
        mirrorOfId: usdcBet.id,
      },
    });
    await prisma.activity.create({
      data: { type: "bet_created", userHandle: creator.handle, betId: twin.id, currency: "pts" },
    });
  }

  return usdcBet;
}

export async function onChainBetPlaced(betId: number, userAddr: string, option: number, amountMicro: bigint) {
  const user = await getOrCreateUserByWallet(userAddr);
  const amount = Number(amountMicro); // micro-unidades (Int en DB, tope testnet ~2147 USDC)
  await prisma.$transaction(async (tx) => {
    const mine = await tx.stake.findUnique({
      where: { userId_betId: { userId: user.id, betId } },
    });
    if (mine) {
      await tx.stake.update({ where: { id: mine.id }, data: { amount: { increment: amount } } });
    } else {
      await tx.stake.create({ data: { userId: user.id, betId, option, amount } });
    }
    await tx.activity.create({
      data: { type: "bet_placed", userHandle: user.handle, betId, amount, side: option, currency: "usdc" },
    });
  });
}

export async function onChainResolved(betId: number, option: number) {
  const b = await prisma.bet.findUnique({ where: { id: betId }, include: { mirror: true } });
  if (!b || b.status !== "open") return;
  await prisma.bet.update({ where: { id: betId }, data: { status: "resolved", winningOption: option } });
  const creator = await prisma.user.findUnique({ where: { id: b.creatorId }, select: { handle: true } });
  await prisma.activity.create({
    data: { type: "resolved", userHandle: creator?.handle ?? "", betId, side: option, currency: "usdc" },
  });
  // el gemelo de puntos se resuelve SOLO: una sola acción del creador
  if (b.mirror) await systemResolveBet(b.mirror.id, option);
}

export async function onChainCancelled(betId: number) {
  const b = await prisma.bet.findUnique({ where: { id: betId }, include: { mirror: true } });
  if (!b || b.status !== "open") return;
  // en la cadena cada uno hace pull de refund(); acá solo se refleja el estado
  await prisma.bet.update({ where: { id: betId }, data: { status: "cancelled" } });
  if (b.mirror) await systemCancelBet(b.mirror.id); // pts sí se devuelven automático
}

export async function onChainClaimed(betId: number, userAddr: string, amountMicro: bigint) {
  const user = await getOrCreateUserByWallet(userAddr);
  await prisma.stake.updateMany({
    where: { betId, userId: user.id },
    data: { settled: true },
  });
  await prisma.activity.create({
    data: { type: "claimed", userHandle: user.handle, betId, amount: Number(amountMicro), currency: "usdc" },
  });
}

export async function onChainLocked(betId: number) {
  await prisma.bet.updateMany({
    where: { id: betId, status: "open", lockedAt: null },
    data: { lockedAt: new Date() },
  });
}

/** true si el evento no se había procesado (y lo marca). Idempotencia dura. */
async function markEventFresh(log: Log): Promise<boolean> {
  try {
    await prisma.chainEvent.create({ data: { id: `${log.transactionHash}:${log.logIndex}` } });
    return true;
  } catch (e: any) {
    if (e?.code === "P2002") return false;
    throw e;
  }
}

/* ------------------------------ el poller ------------------------------ */

export async function runIndexerTick() {
  const state = await prisma.indexerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastBlock: BigInt(AMOY.deployBlock) },
    update: {},
  });
  const latest = await client.getBlockNumber();
  let from = state.lastBlock + 1n;
  if (latest < from) return 0;
  const to = latest - from > MAX_RANGE ? from + MAX_RANGE : latest;

  // 1) nacimientos (factory)
  const createdLogs = await client.getLogs({
    address: AMOY.betFactory as `0x${string}`,
    events: factoryEvents as any,
    fromBlock: from,
    toBlock: to,
  });
  for (const log of createdLogs as (Log & { eventName: string; args: any })[]) {
    if (log.eventName === "BetCreated" && (await markEventFresh(log))) {
      await onChainBetCreated(log.args.bet, log.args.creator);
    }
  }

  // 2) vida de los bets conocidos
  const known = await prisma.bet.findMany({
    where: { chainAddress: { not: null }, status: "open" },
    select: { id: true, chainAddress: true },
  });
  if (known.length > 0) {
    const byAddr = new Map(known.map((k) => [k.chainAddress!.toLowerCase(), k.id]));
    const logs = await client.getLogs({
      address: known.map((k) => k.chainAddress as `0x${string}`),
      events: betEvents as any,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs as (Log & { eventName: string; args: any })[]) {
      const betId = byAddr.get((log.address as string).toLowerCase());
      if (betId === undefined) continue;
      if (!(await markEventFresh(log))) continue; // ya procesado (re-scan tras crash)
      switch (log.eventName) {
        case "BetPlaced":
          await onChainBetPlaced(betId, log.args.user, Number(log.args.option), log.args.amount);
          break;
        case "Resolved":
          await onChainResolved(betId, Number(log.args.option));
          break;
        case "Cancelled":
          await onChainCancelled(betId);
          break;
        case "Claimed":
          await onChainClaimed(betId, log.args.user, log.args.amount);
          break;
        case "LockedEvent":
          await onChainLocked(betId);
          break;
      }
    }
  }

  await prisma.indexerState.update({ where: { id: 1 }, data: { lastBlock: to } });
  return Number(to - from + 1n);
}

/** Arranca el loop del indexer (cada ~5 s, sin solapamiento). */
export function startIndexer(intervalMs = 5000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runIndexerTick();
    } catch (e) {
      console.error("indexer:", (e as Error).message);
    } finally {
      running = false;
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}
