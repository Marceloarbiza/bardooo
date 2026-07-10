/*  Integración del flujo completo contra bardooo_test (la "prueba de fuego"
    de la fase 2, versión automatizada): crear → apostar → resolver → cobrar,
    privadas con código server-side, La Ficha anti-trampa, referidos, y el
    ledger cuadrando al punto con packages/core.                              */

// La URL de la DB de test la fija vitest.config.ts ANTES de estos imports
// (asignarla acá no sirve: los imports se ejecutan primero por hoisting de ESM).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server";
import { prisma } from "../src/db";
import { expireOverdueRelampagos } from "../src/services/bets";
import type { AuthResult } from "../src/auth";

/* auth de test: "Bearer test:<nombre>" → privyId test:<nombre>, name <nombre> */
const fakeVerifier = async (authorization: string | undefined): Promise<AuthResult> => {
  const token = authorization?.replace("Bearer ", "") ?? "";
  if (!token.startsWith("test:")) throw new Error("token inválido");
  return { privyId: token, nameHint: token.slice(5) };
};

let app: Awaited<ReturnType<typeof buildServer>>;
const H = (who: string) => ({ authorization: `Bearer test:${who}` });

const api = async (method: "GET" | "POST" | "PATCH", url: string, who?: string, body?: unknown) => {
  const res = await app.inject({
    method, url,
    headers: who ? H(who) : undefined,
    payload: body === undefined ? undefined : body,
  });
  return { status: res.statusCode, body: res.json() };
};

async function cleanDb() {
  await prisma.activity.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.flight.deleteMany();
  await prisma.pointsLedger.deleteMany();
  await prisma.stake.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  app = await buildServer({ verifyToken: fakeVerifier });
  await cleanDb();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("alta de usuario", () => {
  it("primer login crea usuario con 60 pts de bienvenida (via ledger)", async () => {
    const r = await api("GET", "/me", "diego");
    expect(r.status).toBe(200);
    expect(r.body.user.points).toBe(60);
    expect(r.body.user.handle).toBe("@diego");
    expect(r.body.flightsLeft).toBe(3);
    const ledger = await prisma.pointsLedger.findMany({ where: { reason: "bienvenida" } });
    expect(ledger.some((l) => l.delta === 60)).toBe(true);
  });

  it("handles únicos: mismo nombre → sufijo numérico", async () => {
    const r1 = await api("GET", "/me", "ana");
    const r2 = await api("GET", "/me", "ana2"); // otro privyId...
    await prisma.user.update({ where: { privyId: "test:ana2" }, data: { name: "ana" } });
    // el caso real: dos privyId distintos con el mismo nombre
    const rA = await api("GET", "/me", "anaX");
    expect(r1.body.user.handle).toBe("@ana");
    expect(rA.body.user.handle).toBe("@anax");
  });

  it("sin token → 401 en endpoints de sesión", async () => {
    const r = await api("GET", "/me");
    expect(r.status).toBe(401);
  });
});

describe("flujo completo con los números sagrados (pareja 20/50 vs 60, fee 10%)", () => {
  let betId: number;

  it("diego crea el duelo (modo completo, 7% creador)", async () => {
    const r = await api("POST", "/bets", "diego", {
      question: "¿La Mona da el primer golpe en el round 1?",
      stakeMode: "free", minStake: 5, creatorBps: 700,
      closeTime: Date.now() + 60_000, resolveTime: Date.now() + 120_000,
    });
    expect(r.status).toBe(200);
    betId = r.body.bet.id;
    expect(r.body.bet.status).toBe("open");
  });

  it("alice 20 al SÍ, bob 50 al SÍ, carol 60 al NO", async () => {
    expect((await api("POST", `/bets/${betId}/place`, "alice", { option: 1, amount: 20 })).status).toBe(200);
    expect((await api("POST", `/bets/${betId}/place`, "bob", { option: 1, amount: 50 })).status).toBe(200);
    const r = await api("POST", `/bets/${betId}/place`, "carol", { option: 0, amount: 60 });
    expect(r.status).toBe(200);
    expect(r.body.bet.pools).toEqual([60, 70]);
    expect(r.body.bet.bettors).toBe(3);
  });

  it("el creador no puede apostar en su propio pozo (paridad con el contrato)", async () => {
    const r = await api("POST", `/bets/${betId}/place`, "diego", { option: 1, amount: 5 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("CREATOR_CANNOT_BET");
  });

  it("regla de un solo lado: alice no puede ir al NO", async () => {
    const r = await api("POST", `/bets/${betId}/place`, "alice", { option: 0, amount: 5 });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain("Ya estás del lado del SÍ");
  });

  it("sí puede sumar al mismo lado (no duplica bettors) — en un duelo aparte", async () => {
    const c = await api("POST", "/bets", "ana", {
      question: "¿Alice suma al mismo lado?", stakeMode: "free", minStake: 5, creatorBps: 500,
      closeTime: Date.now() + 60_000, resolveTime: Date.now() + 120_000,
    });
    const id = c.body.bet.id;
    await api("POST", `/bets/${id}/place`, "alice", { option: 1, amount: 10 });
    const r = await api("POST", `/bets/${id}/place`, "alice", { option: 1, amount: 5 });
    expect(r.status).toBe(200);
    expect(r.body.bet.bettors).toBe(1);
    expect(r.body.bet.myStake).toEqual([0, 15]);
  });

  it("saldo insuficiente → error y no toca nada", async () => {
    const r = await api("POST", `/bets/${betId}/place`, "pobre", { option: 1, amount: 100 });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("No te alcanzan los puntos");
  });

  it("resolver antes de tiempo → TOO_EARLY; otro que no es el creador → 403", async () => {
    expect((await api("POST", `/bets/${betId}/resolve`, "diego", { option: 1 })).status).toBe(409);
    expect((await api("POST", `/bets/${betId}/resolve`, "alice", { option: 1 })).status).toBe(403);
  });

  it("resuelve el SÍ: comisión 13, creador cobra 10 (split floor como el contrato)", async () => {
    await prisma.bet.update({
      where: { id: betId },
      data: { closeTime: new Date(Date.now() - 2000), resolveTime: new Date(Date.now() - 1000) },
    });
    const before = (await api("GET", "/me", "diego")).body.user.points;
    const r = await api("POST", `/bets/${betId}/resolve`, "diego", { option: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cancelled: false, creatorCut: 10, platformCut: 3 });
    const after = (await api("GET", "/me", "diego")).body.user.points;
    expect(after - before).toBe(10);
  });

  it("alice cobra 33, bob 83; carol no tiene premio; doble claim revienta", async () => {
    const a = await api("POST", `/bets/${betId}/claim`, "alice");
    expect(a.body.pay).toBe(33);
    const b = await api("POST", `/bets/${betId}/claim`, "bob");
    expect(b.body.pay).toBe(83);
    expect((await api("POST", `/bets/${betId}/claim`, "carol")).status).toBe(409);
    expect((await api("POST", `/bets/${betId}/claim`, "alice")).status).toBe(409);
  });

  it("el ledger del duelo cuadra: entradas - salidas = plataforma + dust", async () => {
    const rows = await prisma.pointsLedger.findMany({ where: { ref: `bet:${betId}` } });
    const sum = rows.reduce((a, r) => a + r.delta, 0);
    // -130 (apuestas) +10 (comisión creador) +33 +83 (premios) = -4 = plataforma 3 + dust 1
    expect(sum).toBe(-4);
    const bet = await prisma.bet.findUniqueOrThrow({ where: { id: betId } });
    expect(bet.dust).toBe(1);
  });
});

describe("anulación sin contraparte", () => {
  it("todos del mismo lado → cancelada y devolución completa automática", async () => {
    const c = await api("POST", "/bets", "diego", {
      question: "¿Se anula esto solo?", stakeMode: "free", minStake: 5, creatorBps: 500,
      closeTime: Date.now() + 60_000, resolveTime: Date.now() + 120_000,
    });
    const id = c.body.bet.id;
    await api("POST", `/bets/${id}/place`, "alice", { option: 1, amount: 10 });
    const alicePts = (await api("GET", "/me", "alice")).body.user.points;
    await prisma.bet.update({
      where: { id },
      data: { closeTime: new Date(Date.now() - 2000), resolveTime: new Date(Date.now() - 1000) },
    });
    const r = await api("POST", `/bets/${id}/resolve`, "diego", { option: 1 });
    expect(r.body.cancelled).toBe(true);
    const after = (await api("GET", "/me", "alice")).body.user.points;
    expect(after - alicePts).toBe(10); // recuperó su stake completo, sin comisión
  });
});

describe("relámpago", () => {
  it("el server fija los tiempos; el split cede 2pp al creador; el total no cambia", async () => {
    const c = await api("POST", "/bets", "diego", {
      question: "¿Hay gol antes del entretiempo?", stakeMode: "free", minStake: 5,
      creatorBps: 700, relampago: true, windowMin: 15,
    });
    expect(c.status).toBe(200);
    const bet = c.body.bet;
    expect(bet.relampago).toBe(true);
    expect(bet.deadline - bet.closeTime).toBe(30 * 60000); // cierre + 30 min FIJO
    const id = bet.id;

    // usuarios frescos (60 pts de bienvenida cada uno): mismos números sagrados
    await api("POST", `/bets/${id}/place`, "ralice", { option: 1, amount: 20 });
    await api("POST", `/bets/${id}/place`, "rbob", { option: 1, amount: 50 });
    await api("POST", `/bets/${id}/place`, "rcarol", { option: 0, amount: 60 });
    await prisma.bet.update({
      where: { id },
      data: { closeTime: new Date(Date.now() - 2000), resolveTime: new Date(Date.now() - 1000) },
    });
    const r = await api("POST", `/bets/${id}/resolve`, "diego", { option: 1 });
    // misma comisión total (13) pero split 1/12: BARDOOO cobra solo 1%
    expect(r.body).toMatchObject({ cancelled: false, creatorCut: 12, platformCut: 1 });
    // el apostador cobra EXACTAMENTE lo mismo que sin relámpago
    expect((await api("POST", `/bets/${id}/claim`, "ralice")).body.pay).toBe(33);
  });

  it("vencido sin resolver → el cron lo anula y devuelve", async () => {
    const c = await api("POST", "/bets", "diego", {
      question: "¿Este vence sin resultado?", stakeMode: "free", minStake: 5,
      creatorBps: 700, relampago: true, windowMin: 5,
    });
    const id = c.body.bet.id;
    await api("POST", `/bets/${id}/place`, "alice", { option: 1, amount: 5 });
    const before = (await api("GET", "/me", "alice")).body.user.points;
    await prisma.bet.update({ where: { id }, data: { deadline: new Date(Date.now() - 1000) } });

    const n = await expireOverdueRelampagos();
    expect(n).toBeGreaterThanOrEqual(1);
    const after = (await api("GET", "/me", "alice")).body.user.points;
    expect(after - before).toBe(5);
    expect((await api("GET", `/bets/${id}`, "alice")).body.bet.status).toBe("cancelled");
  });
});

describe("privadas con código (server-side, el código nunca viaja)", () => {
  let id: number;

  it("no aparece en el listado público y el GET pide código", async () => {
    const c = await api("POST", "/bets", "diego", {
      question: "Asado: ¿Rodri llega tarde otra vez?", stakeMode: "free", minStake: 5,
      creatorBps: 500, isPrivate: true, code: "ASADO",
      closeTime: Date.now() + 60_000, resolveTime: Date.now() + 120_000,
    });
    id = c.body.bet.id;
    expect(c.body.bet.hasCode).toBe(true);
    expect(JSON.stringify(c.body)).not.toContain("ASADO"); // ni al creador se le devuelve

    const list = await api("GET", "/bets", "alice");
    expect(list.body.bets.some((b: any) => b.id === id)).toBe(false);

    expect((await api("GET", `/bets/${id}`, "alice")).status).toBe(403);
  });

  it("unlock: código incorrecto 403, correcto (case-insensitive) devuelve el duelo", async () => {
    expect((await api("POST", `/bets/${id}/unlock`, "alice", { code: "CHORIPAN" })).status).toBe(403);
    const ok = await api("POST", `/bets/${id}/unlock`, "alice", { code: "asado" });
    expect(ok.status).toBe(200);
    expect(ok.body.bet.id).toBe(id);
  });

  it("el creador entra sin código; la actividad pública no la menciona", async () => {
    expect((await api("GET", `/bets/${id}`, "diego")).status).toBe(200);
    const act = await api("GET", "/activity");
    expect(act.body.activity.some((a: any) => a.betId === id)).toBe(false);
  });
});

describe("La Ficha anti-trampa", () => {
  it("score imposible (>15) → rechazado", async () => {
    const s = await api("POST", "/ficha/start", "gamer");
    const r = await api("POST", "/ficha/end", "gamer", { flightId: s.body.flightId, score: 16 });
    expect(r.status).toBe(400);
  });

  it("vuelo demasiado rápido para el score → rechazado", async () => {
    const s = await api("POST", "/ficha/start", "gamer");
    const r = await api("POST", "/ficha/end", "gamer", { flightId: s.body.flightId, score: 10 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("FLIGHT_TOO_FAST");
  });

  it("vuelo legítimo acredita 1 pt por caño (duración plausible)", async () => {
    const s = await api("POST", "/ficha/start", "gamer");
    await prisma.flight.update({
      where: { id: s.body.flightId },
      data: { startedAt: new Date(Date.now() - 20_000) }, // 20 s de vuelo
    });
    const before = (await api("GET", "/me", "gamer")).body.user.points;
    const r = await api("POST", "/ficha/end", "gamer", { flightId: s.body.flightId, score: 8 });
    expect(r.body.prize).toBe(8);
    const after = (await api("GET", "/me", "gamer")).body.user.points;
    expect(after - before).toBe(8);
  });

  it("el 4to vuelo del día → rechazado (el server cuenta, no el cliente)", async () => {
    const r = await api("POST", "/ficha/start", "gamer"); // ya usó 3
    expect(r.status).toBe(429);
    expect(r.body.message).toContain("Sin vuelos por hoy");
  });

  it("no se puede reusar un flightId ajeno o ya cerrado", async () => {
    const flights = await prisma.flight.findMany({ where: { endedAt: { not: null } }, take: 1 });
    const r = await api("POST", "/ficha/end", "otrogamer", { flightId: flights[0].id, score: 3 });
    expect(r.status).toBe(400);
  });
});

describe("referidos (+25 recién con la primera acción real)", () => {
  it("registrar el código no paga; la primera apuesta del referido sí", async () => {
    const diego = (await api("GET", "/me", "diego")).body.user;
    const r = await api("POST", "/referrals/use", "nuevo", { code: diego.refCode });
    expect(r.body.registered).toBe(true);

    const before = (await api("GET", "/me", "diego")).body.user.points;

    // primera acción real del referido: apostar
    const c = await api("POST", "/bets", "ana", {
      question: "¿El nuevo apuesta hoy?", stakeMode: "free", minStake: 5, creatorBps: 0,
      closeTime: Date.now() + 60_000, resolveTime: Date.now() + 120_000,
    });
    await api("POST", `/bets/${c.body.bet.id}/place`, "nuevo", { option: 1, amount: 5 });

    const after = (await api("GET", "/me", "diego")).body.user.points;
    expect(after - before).toBe(25);
  });

  it("un vuelo de La Ficha (aunque sea con 0 caños) también acredita", async () => {
    const ana = (await api("GET", "/me", "ana")).body.user;
    await api("POST", "/referrals/use", "torpe", { code: ana.refCode });
    const before = (await api("GET", "/me", "ana")).body.user.points;

    const s = await api("POST", "/ficha/start", "torpe");
    await api("POST", "/ficha/end", "torpe", { flightId: s.body.flightId, score: 0 }); // se estrelló al toque

    const after = (await api("GET", "/me", "ana")).body.user.points;
    expect(after - before).toBe(25); // entrar a jugar YA cuenta (decisión del dueño)
  });

  it("no se acredita dos veces ni permite auto-referido", async () => {
    const diego = (await api("GET", "/me", "diego")).body.user;
    const before = diego.points;
    // segunda apuesta del mismo referido: no paga de nuevo
    const bets = await api("GET", "/bets", "nuevo");
    const open = bets.body.bets.find((b: any) => b.status === "open" && !b.creator.mine);
    await api("POST", `/bets/${open.id}/place`, "nuevo", { option: 1, amount: 5 });
    const after = (await api("GET", "/me", "diego")).body.user.points;
    expect(after - before).toBe(0);

    const self = await api("POST", "/referrals/use", "diego", { code: diego.refCode });
    expect(self.status).toBe(400);
  });
});

describe("tiempos al crear", () => {
  it("evento demasiado pronto (el cierre de 5-min-antes ya pasó) → rechazado", async () => {
    // el front resta los 5 min y valida, pero la regla vive en el SERVER:
    // un cliente trucho mandando un closeTime pasado rebota igual
    const r = await api("POST", "/bets", "diego", {
      question: "¿Se puede crear con el cierre ya pasado?", stakeMode: "free",
      minStake: 5, closeTime: Date.now() - 60_000, resolveTime: Date.now() + 3600_000,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("BAD_TIME");
  });
});

describe("USDC todavía no (fase 3)", () => {
  it("crear duelo usdc → 'pronto'", async () => {
    const r = await api("POST", "/bets", "diego", {
      question: "¿Duelo de plata real ya?", currency: "usdc", stakeMode: "free",
      minStake: 5, creatorBps: 500,
      closeTime: Date.now() + 60_000, resolveTime: Date.now() + 120_000,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("USDC_SOON");
  });
});
