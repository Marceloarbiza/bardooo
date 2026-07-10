/*  Panel de admin MÍNIMO (fase 5): por ahora, VOS sos la ventana de disputa.
    Corre contra la DB que diga BARDOOO_DATABASE_URL (local por defecto;
    para producción: exportar la DATABASE_PUBLIC_URL del Postgres de Railway).

    Uso (desde apps/api):
      pnpm admin bets                    → últimas 20 apuestas
      pnpm admin bet 12                  → detalle + stakes de la apuesta 12
      pnpm admin cancel 12 "motivo"      → anula una apuesta de PUNTOS (devuelve todo)
      pnpm admin user @handle            → usuario + últimos movimientos
      pnpm admin points @handle 50 "premio del stream"   → ajuste con motivo
      pnpm admin points @handle -20 "corrección doble acreditación"
*/

import "dotenv/config";
import { prisma } from "../src/db";
import { systemCancelBet } from "../src/services/bets";
import { getKnobs, setKnob, type PlatformKnobs } from "../src/services/config";

const [, , cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case "bets": {
      const bets = await prisma.bet.findMany({
        orderBy: { createdAt: "desc" }, take: 20,
        include: { creator: { select: { handle: true } }, stakes: true },
      });
      for (const b of bets) {
        const pool = b.stakes.reduce((a, s) => a + s.amount, 0);
        console.log(
          `#${b.id} [${b.status}] ${b.currency} ${b.isPrivate ? "🔒" : "  "} ` +
          `${b.creator.handle} — "${b.question.slice(0, 50)}" pozo=${pool} bettors=${b.stakes.length}`
        );
      }
      break;
    }

    case "bet": {
      const id = Number(args[0]);
      const b = await prisma.bet.findUniqueOrThrow({
        where: { id },
        include: { creator: true, stakes: { include: { user: true } }, mirror: true, mirrorOf: true },
      });
      console.log(JSON.stringify({
        id: b.id, q: b.question, currency: b.currency, status: b.status,
        winner: b.winningOption, creator: b.creator.handle, dust: b.dust,
        chainAddress: b.chainAddress, mirrorOfId: b.mirrorOfId, mirrorId: b.mirror?.id ?? null,
        closeTime: b.closeTime, resolveTime: b.resolveTime, deadline: b.deadline,
      }, null, 2));
      for (const s of b.stakes) {
        console.log(`  ${s.user.handle} → opción ${s.option} por ${s.amount} ${s.settled ? "(liquidado)" : ""}`);
      }
      break;
    }

    case "cancel": {
      const id = Number(args[0]);
      const motivo = args[1];
      if (!motivo) throw new Error("Falta el motivo: pnpm admin cancel <id> \"motivo\"");
      const b = await prisma.bet.findUniqueOrThrow({ where: { id } });
      if (b.currency === "usdc") throw new Error("Los duelos usdc se anulan on-chain (cancel/forceRefund), no desde acá");
      const r = await systemCancelBet(id);
      if (!r) throw new Error(`La apuesta #${id} no está open (status actual: ${b.status})`);
      await prisma.activity.create({
        data: { type: "resolved", userHandle: "@bardooo", betId: id, currency: "pts" },
      });
      console.log(`Apuesta #${id} anulada con devolución completa. Motivo registrado: ${motivo}`);
      break;
    }

    case "user": {
      const handle = args[0];
      const u = await prisma.user.findUniqueOrThrow({ where: { handle } });
      console.log(JSON.stringify({
        id: u.id, name: u.name, handle: u.handle, points: u.points,
        walletAddr: u.walletAddr, refCode: u.refCode, createdAt: u.createdAt,
      }, null, 2));
      const ledger = await prisma.pointsLedger.findMany({
        where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 15,
      });
      for (const l of ledger) {
        console.log(`  ${l.createdAt.toISOString().slice(0, 16)} ${l.delta > 0 ? "+" : ""}${l.delta} ${l.reason} ${l.ref ?? ""}`);
      }
      break;
    }

    case "points": {
      const [handle, deltaStr, ...motivoParts] = args;
      const delta = Math.trunc(Number(deltaStr));
      const motivo = motivoParts.join(" ").trim();
      if (!handle || !Number.isFinite(delta) || delta === 0 || !motivo)
        throw new Error('Uso: pnpm admin points @handle <delta≠0> "motivo"');
      const u = await prisma.user.findUniqueOrThrow({ where: { handle } });
      if (delta < 0 && u.points + delta < 0)
        throw new Error(`${handle} tiene ${u.points} pts: no puede quedar negativo`);
      await prisma.$transaction([
        prisma.user.update({ where: { id: u.id }, data: { points: { increment: delta } } }),
        prisma.pointsLedger.create({
          data: { userId: u.id, delta, reason: "ajuste", ref: `admin: ${motivo}` },
        }),
      ]);
      console.log(`${handle}: ${u.points} → ${u.points + delta} pts (ajuste: ${motivo})`);
      break;
    }

    case "funnel": {
      // LAS métricas del proyecto (PLAN.md): login → vuelo → apuesta → share → wallet
      const usuarios = await prisma.user.count({ where: { NOT: { privyId: { startsWith: "wallet:" } } } });
      const conVuelo = (await prisma.flight.groupBy({ by: ["userId"] })).length;
      const conApuesta = (await prisma.stake.groupBy({ by: ["userId"] })).length;
      const conShare = await prisma.funnelEvent.count({ where: { kind: "share" } });
      const conWallet = await prisma.user.count({
        where: { walletAddr: { not: null }, NOT: { privyId: { startsWith: "wallet:" } } },
      });
      const pct = (n: number) => (usuarios ? ` (${Math.round((n / usuarios) * 100)}%)` : "");
      console.log(`EMBUDO BARDOOO`);
      console.log(`  1. Login (usuarios reales): ${usuarios}`);
      console.log(`  2. Primer vuelo de La Ficha: ${conVuelo}${pct(conVuelo)}`);
      console.log(`  3. Primera apuesta:          ${conApuesta}${pct(conApuesta)}`);
      console.log(`  4. Primer share:             ${conShare}${pct(conShare)}`);
      console.log(`  5. Wallet activada:          ${conWallet}${pct(conWallet)}`);
      break;
    }

    case "config": {
      // perillas anti-bots (decisión del dueño: lanzar abierto, prender con datos)
      // acepta "config set <perilla> <valor>" y "config <perilla> <valor>"
      const cfgArgs = args[0] === "set" ? args.slice(1) : args;
      const [key, value] = cfgArgs;
      if (key && value !== undefined) {
        const valid = ["bondPts", "createsPerDay", "relayBudgetMilli"];
        if (!valid.includes(key)) throw new Error(`Perillas válidas: ${valid.join(", ")}`);
        const n = Math.trunc(Number(value));
        if (!Number.isFinite(n) || n < 0) throw new Error("El valor debe ser un entero ≥ 0");
        await setKnob(key as keyof PlatformKnobs, n);
        console.log(`${key} = ${n} (rige en ≤15 s, sin redeploy)`);
      } else {
        const k = await getKnobs();
        console.log("PERILLAS DE PLATAFORMA (0 = apagada)");
        console.log(`  bondPts          = ${k.bondPts}  (garantía en pts para crear un duelo)`);
        console.log(`  createsPerDay    = ${k.createsPerDay}  (cupo de creaciones por cuenta/día)`);
        console.log(`  relayBudgetMilli = ${k.relayBudgetMilli}  (FUSIBLE: miliPOL/hora de gas patrocinado)`);
        const hour = await prisma.relaySpend.aggregate({
          _sum: { costWei: true }, where: { createdAt: { gte: new Date(Date.now() - 3600_000) } },
        });
        const day = await prisma.relaySpend.aggregate({
          _sum: { costWei: true }, where: { createdAt: { gte: new Date(Date.now() - 86400_000) } },
        });
        const pol = (w: bigint | null) => (Number(w ?? 0n) / 1e18).toFixed(4);
        console.log(`GASTO DEL RELAYER: última hora ${pol(hour._sum.costWei)} POL · último día ${pol(day._sum.costWei)} POL`);
      }
      break;
    }

    default:
      console.log("Comandos: bets · bet <id> · cancel <id> \"motivo\" · user @handle · points @handle <delta> \"motivo\" · funnel · config [perilla valor]");
  }
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
