/*  Tests de las perillas anti-bots (decisión del dueño 2026-07-09):
    todo configurable, lanzamiento abierto (0 = apagado), y el FUSIBLE del
    relayer siempre vivo. Garantía: vuelve al resolver, se pierde por abandono. */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db";
import { setKnob, setKnobs, getKnobs } from "../src/services/config";
import { createBet, resolveBet, expireOverdueRelampagos, placeBet } from "../src/services/bets";
import { assertRelayBudget } from "../src/relay";

async function mkUser(name: string, points = 1000) {
  return prisma.user.create({
    data: { privyId: `test:${name}:${Math.random()}`, name, handle: `@${name}${Math.floor(Math.random() * 1e6)}`, points },
  });
}

const fullInput = (q: string) => ({
  question: q, currency: "pts" as const, stakeMode: "free" as const,
  minStake: 5, creatorBps: 700,
  closeTime: Date.now() + 60_000, resolveTime: Date.now() + 120_000,
});

beforeAll(async () => {
  await prisma.relaySpend.deleteMany();
  await prisma.chainEvent.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.flight.deleteMany();
  await prisma.pointsLedger.deleteMany();
  await prisma.stake.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.platformConfig.deleteMany();
});

afterAll(async () => {
  // dejar las perillas apagadas como el default de lanzamiento
  await setKnob("bondPts", 0);
  await setKnob("createsPerDay", 0);
  await setKnob("relayBudgetMilli", 150);
  await setKnobs({ platformBps: 300, creatorBps: 700, flashPlatformBps: 100, flashCreatorBps: 900 });
  await prisma.$disconnect();
});

describe("perillas apagadas por default (lanzamiento abierto)", () => {
  it("bondPts=0 y createsPerDay=0: crear es gratis e ilimitado", async () => {
    const k = await getKnobs();
    expect(k.bondPts).toBe(0);
    expect(k.createsPerDay).toBe(0);
    expect(k.relayBudgetMilli).toBeGreaterThan(0); // el fusible SIEMPRE tiene valor

    const u = await mkUser("libre");
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).points;
    await createBet(u.id, fullInput("¿Crear es gratis con la perilla en 0?"));
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).points;
    expect(after).toBe(before); // sin garantía retenida
  });
});

describe("garantía del creador (bondPts prendida)", () => {
  it("se retiene al crear y VUELVE al resolver (junto a la comisión)", async () => {
    await setKnob("bondPts", 10);
    const creator = await mkUser("juez");
    const a = await mkUser("apostadorA");
    const c = await mkUser("apostadorC");

    const bet = await createBet(creator.id, fullInput("¿La garantía vuelve al resolver?"));
    let pts = (await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).points;
    expect(pts).toBe(990); // 1000 - 10 de garantía

    await placeBet(a.id, bet.id, 1, 20);
    await placeBet(c.id, bet.id, 0, 60);
    await prisma.bet.update({
      where: { id: bet.id },
      data: { closeTime: new Date(Date.now() - 2000), resolveTime: new Date(Date.now() - 1000) },
    });
    const r = await resolveBet(creator.id, bet.id, 1);
    expect(r.cancelled).toBe(false);

    pts = (await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).points;
    // 990 + 10 de garantía + comisión: total 80, fee 8 (≤ perdedor 60);
    // plataforma floor(8×300/1000)=2, creador 8−2=6
    expect(pts).toBe(990 + 10 + 6);
    const ledger = await prisma.pointsLedger.findMany({ where: { userId: creator.id, reason: "garantia" } });
    expect(ledger.map((l) => l.delta).sort((x, y) => x - y)).toEqual([-10, 10]);
  });

  it("anulación SIN culpa (sin contraparte): la garantía también vuelve", async () => {
    const creator = await mkUser("juezsolo");
    const a = await mkUser("solitarioA");
    const bet = await createBet(creator.id, fullInput("¿Sin contraparte devuelve la garantía?"));
    await placeBet(a.id, bet.id, 1, 10);
    await prisma.bet.update({
      where: { id: bet.id },
      data: { closeTime: new Date(Date.now() - 2000), resolveTime: new Date(Date.now() - 1000) },
    });
    const r = await resolveBet(creator.id, bet.id, 1);
    expect(r.cancelled).toBe(true);
    const pts = (await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).points;
    expect(pts).toBe(1000); // recuperó la garantía entera
  });

  it("ABANDONO (relámpago vencido por cron): la garantía se pierde", async () => {
    const creator = await mkUser("fantasma");
    const a = await mkUser("colgadoA");
    const bet = await createBet(creator.id, {
      question: "¿El fantasma pierde su garantía?", currency: "pts", stakeMode: "free",
      minStake: 5, creatorBps: 700, relampago: true, windowMin: 5,
    });
    await placeBet(a.id, bet.id, 1, 30);
    const aBefore = (await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).points;
    await prisma.bet.update({ where: { id: bet.id }, data: { deadline: new Date(Date.now() - 1000) } });

    await expireOverdueRelampagos();

    const aAfter = (await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).points;
    expect(aAfter - aBefore).toBe(30); // el apostador recupera TODO
    const cPts = (await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).points;
    expect(cPts).toBe(990); // la garantía NO volvió: castigo por abandonar
  });

  it("gracia de 4h para duelos comunes: abandono también pierde la garantía", async () => {
    const creator = await mkUser("fantasma2");
    const a = await mkUser("colgadoB");
    const bet = await createBet(creator.id, fullInput("¿La gracia de 4h también castiga?"));
    await placeBet(a.id, bet.id, 1, 15);
    await prisma.bet.update({
      where: { id: bet.id },
      data: { resolveTime: new Date(Date.now() - 5 * 3600 * 1000) }, // venció hace 5h
    });
    await expireOverdueRelampagos();
    expect((await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } })).status).toBe("cancelled");
    const cPts = (await prisma.user.findUniqueOrThrow({ where: { id: creator.id } })).points;
    expect(cPts).toBe(990);
  });
});

describe("cupo de creaciones por día", () => {
  it("con createsPerDay=2, la tercera creación rebota", async () => {
    await setKnob("bondPts", 0);
    await setKnob("createsPerDay", 2);
    const u = await mkUser("prolifico");
    await createBet(u.id, fullInput("¿Primera del día pasa bien?"));
    await createBet(u.id, fullInput("¿Segunda del día pasa bien?"));
    await expect(createBet(u.id, fullInput("¿La tercera rebota como debe?")))
      .rejects.toMatchObject({ code: "CREATE_LIMIT" });
    await setKnob("createsPerDay", 0);
  });
});

describe("comisiones como perillas (decisión del dueño 2026-07-10)", () => {
  it("defaults: 300/700 común y 100/900 flash — y cada duelo los CONGELA al nacer", async () => {
    const k = await getKnobs();
    expect([k.platformBps, k.creatorBps, k.flashPlatformBps, k.flashCreatorBps]).toEqual([300, 700, 100, 900]);

    const u = await mkUser("congelador");
    const normal = await createBet(u.id, fullInput("¿El común congela 300/700 al nacer?"));
    expect([normal.platformBps, normal.creatorBps, normal.feeBps]).toEqual([300, 700, 1000]);

    const flash = await createBet(u.id, {
      question: "¿El flash congela 100/900 al nacer?", currency: "pts", stakeMode: "free",
      minStake: 5, relampago: true, windowMin: 5,
    });
    expect([flash.platformBps, flash.creatorBps, flash.feeBps]).toEqual([100, 900, 1000]);
  });

  it("mover UNA sola perilla de comisión rompe la invariante normal == flash", async () => {
    await expect(setKnob("platformBps", 0)).rejects.toThrow(/normal.*flash/);
  });

  it("techo 20% (espejo del FeeTooHigh de la factory)", async () => {
    await expect(
      setKnobs({ platformBps: 1500, creatorBps: 1000, flashPlatformBps: 1300, flashCreatorBps: 1200 })
    ).rejects.toThrow(/20%/);
  });

  it("plataforma 0%: seteo atómico, snapshot nuevo, y los duelos viejos NO cambian", async () => {
    const u = await mkUser("fundador");
    const viejo = await createBet(u.id, fullInput("¿El duelo viejo conserva sus bps?"));

    // modo lanzamiento: BARDOOO no cobra nada, el creador se lleva todo el 10%
    await setKnobs({ platformBps: 0, creatorBps: 1000, flashPlatformBps: 0, flashCreatorBps: 1000 });

    const nuevo = await createBet(u.id, fullInput("¿El duelo nuevo congela 0/1000?"));
    expect([nuevo.platformBps, nuevo.creatorBps, nuevo.feeBps]).toEqual([0, 1000, 1000]);

    const viejoDb = await prisma.bet.findUniqueOrThrow({ where: { id: viejo.id } });
    expect([viejoDb.platformBps, viejoDb.creatorBps]).toEqual([300, 700]); // intocable

    // resolver el duelo 0/1000: la plataforma no se lleva NADA, el creador todo
    const a = await mkUser("apostadorX");
    const c = await mkUser("apostadorY");
    await placeBet(a.id, nuevo.id, 1, 20);
    await placeBet(c.id, nuevo.id, 0, 60);
    await prisma.bet.update({
      where: { id: nuevo.id },
      data: { closeTime: new Date(Date.now() - 2000), resolveTime: new Date(Date.now() - 1000) },
    });
    const r = await resolveBet(u.id, nuevo.id, 1);
    expect(r.cancelled).toBe(false);
    if (!r.cancelled) {
      // total 80, fee 10% = 8 → plataforma 0, creador 8
      expect(r.platformCut).toBe(0);
      expect(r.creatorCut).toBe(8);
    }

    await setKnobs({ platformBps: 300, creatorBps: 700, flashPlatformBps: 100, flashCreatorBps: 900 });
  });
});

describe("el FUSIBLE del relayer", () => {
  it("bajo presupuesto pasa; sobre presupuesto corta con RELAY_BUSY", async () => {
    await setKnob("relayBudgetMilli", 100); // 0.1 POL/hora
    const u = await mkUser("gastador");
    await expect(assertRelayBudget()).resolves.toBeUndefined();

    // gasto simulado de la última hora: 0.11 POL > 0.1 de presupuesto
    await prisma.relaySpend.create({ data: { userId: u.id, costWei: 110n * 10n ** 15n } });
    await expect(assertRelayBudget()).rejects.toMatchObject({ code: "RELAY_BUSY" });

    // lo gastado hace más de una hora no cuenta
    await prisma.relaySpend.updateMany({ data: { createdAt: new Date(Date.now() - 2 * 3600 * 1000) } });
    await expect(assertRelayBudget()).resolves.toBeUndefined();
  });
});
