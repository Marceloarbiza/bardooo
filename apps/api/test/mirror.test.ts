/*  Tests del ESPEJO (fase 3): el gemelo de puntos sigue solo al duelo usdc
    on-chain. Acá se prueban los handlers del indexer con datos ya parseados
    (sin cadena): materialización, unidades micro→pantalla, resolución espejo
    con los números sagrados, cancelación con refunds, y usuarios sombra.     */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db";
import { serializeBet, systemResolveBet } from "../src/services/bets";
import { onChainBetPlaced, onChainResolved, onChainCancelled, getOrCreateUserByWallet } from "../src/indexer";

const W = {
  ana: "0x00000000000000000000000000000000000000A1",
  beto: "0x00000000000000000000000000000000000000B2",
  cami: "0x00000000000000000000000000000000000000C3",
};

async function mkUser(name: string, points = 0, walletAddr?: string) {
  return prisma.user.create({
    data: { privyId: `test:${name}:${Math.random()}`, name, handle: `@${name}${Math.floor(Math.random() * 1e6)}`, points, walletAddr },
  });
}

/** Duelo usdc materializado + su gemelo pts, como los crearía el indexer. */
async function mkTwins(creatorId: string) {
  const usdc = await prisma.bet.create({
    data: {
      creatorId, question: "¿Espejo?", currency: "usdc", stakeMode: "free",
      minStake: 5_000_000, creatorBps: 700,
      closeTime: new Date(Date.now() + 60000), resolveTime: new Date(Date.now() + 120000),
      chainAddress: "0x" + Math.random().toString(16).slice(2).padEnd(40, "0").slice(0, 40),
    },
  });
  const pts = await prisma.bet.create({
    data: {
      creatorId, question: "¿Espejo?", currency: "pts", stakeMode: "free",
      minStake: 5, creatorBps: 700,
      closeTime: usdc.closeTime, resolveTime: usdc.resolveTime,
      mirrorOfId: usdc.id,
    },
  });
  return { usdc, pts };
}

beforeAll(async () => {
  await prisma.chainEvent.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.flight.deleteMany();
  await prisma.pointsLedger.deleteMany();
  await prisma.stake.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("usuarios sombra por wallet", () => {
  it("wallet desconocida crea sombra sin bienvenida; conocida devuelve al usuario", async () => {
    const shadow = await getOrCreateUserByWallet(W.ana);
    expect(shadow.privyId.startsWith("wallet:")).toBe(true);
    expect(shadow.points).toBe(0);

    const linked = await mkUser("marce", 100, "0x00000000000000000000000000000000000000D4");
    const found = await getOrCreateUserByWallet("0x00000000000000000000000000000000000000d4"); // case-insensitive
    expect(found.id).toBe(linked.id);
  });
});

describe("stakes on-chain en micro-unidades → pantalla en unidades", () => {
  it("BetPlaced acumula micro y serializeBet divide por 1e6", async () => {
    const creator = await mkUser("creadora");
    const { usdc } = await mkTwins(creator.id);

    await onChainBetPlaced(usdc.id, W.ana, 1, 20_000_000n); // 20 USDC al SÍ
    await onChainBetPlaced(usdc.id, W.beto, 1, 50_000_000n);
    await onChainBetPlaced(usdc.id, W.cami, 0, 60_000_000n);
    await onChainBetPlaced(usdc.id, W.ana, 1, 5_000_000n); // suma al mismo lado

    const b = await prisma.bet.findUniqueOrThrow({
      where: { id: usdc.id },
      include: { stakes: true, creator: { select: { id: true, name: true, handle: true } } },
    });
    const s = serializeBet(b as any);
    expect(s.pools).toEqual([60, 75]);
    expect(s.bettors).toBe(3);
    expect(s.minStake).toBe(5);
    expect(s.chainAddress).toBeTruthy();
  });
});

describe("espejo: resolver el usdc on-chain resuelve el gemelo pts SOLO", () => {
  it("caso pareja: el creador cobra 10 pts de comisión y los ganadores su payout floor", async () => {
    const creator = await mkUser("streamer", 0);
    const { usdc, pts } = await mkTwins(creator.id);

    // gente jugando el gemelo de PUNTOS (audiencia sin wallet)
    const a = await mkUser("a", 100);
    const b2 = await mkUser("b", 100);
    const c = await mkUser("c", 100);
    await prisma.stake.createMany({
      data: [
        { userId: a.id, betId: pts.id, option: 1, amount: 20 },
        { userId: b2.id, betId: pts.id, option: 1, amount: 50 },
        { userId: c.id, betId: pts.id, option: 0, amount: 60 },
      ],
    });

    // el creador resuelve EN LA CADENA; el indexer reporta el evento
    await onChainResolved(usdc.id, 1);

    const uAfter = await prisma.bet.findUniqueOrThrow({ where: { id: usdc.id } });
    const pAfter = await prisma.bet.findUniqueOrThrow({ where: { id: pts.id } });
    expect(uAfter.status).toBe("resolved");
    expect(pAfter.status).toBe("resolved"); // ¡solo!
    expect(pAfter.winningOption).toBe(1);
    expect(pAfter.dust).toBe(1); // números sagrados en pts enteros

    const creatorAfter = await prisma.user.findUniqueOrThrow({ where: { id: creator.id } });
    expect(creatorAfter.points).toBe(10); // comisión del gemelo pts (split 3/7 de 13)
  });

  it("es idempotente: reprocesar el Resolved no paga dos veces", async () => {
    const creator = await prisma.user.findFirstOrThrow({ where: { name: "streamer" } });
    const usdc = await prisma.bet.findFirstOrThrow({ where: { currency: "usdc", question: "¿Espejo?", status: "resolved" } });
    const before = creator.points;
    await onChainResolved(usdc.id, 1); // ya está resolved → no-op
    const after = await prisma.user.findUniqueOrThrow({ where: { id: creator.id } });
    expect(after.points).toBe(before);
  });

  it("cancelación on-chain cancela el gemelo y devuelve los pts automáticamente", async () => {
    const creator = await mkUser("otrocreador");
    const { usdc, pts } = await mkTwins(creator.id);
    const d = await mkUser("d", 100);
    await prisma.stake.create({ data: { userId: d.id, betId: pts.id, option: 1, amount: 30 } });
    await prisma.user.update({ where: { id: d.id }, data: { points: { decrement: 30 } } });

    await onChainCancelled(usdc.id);

    expect((await prisma.bet.findUniqueOrThrow({ where: { id: pts.id } })).status).toBe("cancelled");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: d.id } })).points).toBe(100); // devuelto
  });
});

describe("systemResolveBet directo", () => {
  it("gemelo con un solo lado → se cancela y devuelve (sin contraparte)", async () => {
    const creator = await mkUser("solitario");
    const { pts } = await mkTwins(creator.id);
    const e = await mkUser("e", 50);
    await prisma.stake.create({ data: { userId: e.id, betId: pts.id, option: 1, amount: 10 } });
    await prisma.user.update({ where: { id: e.id }, data: { points: { decrement: 10 } } });

    const r = await systemResolveBet(pts.id, 1);
    expect(r?.cancelled).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: e.id } })).points).toBe(50);
  });
});
