/*  Tests SAGRADOS de la liquidación de puntos.
    La regla de oro (CLAUDE.md): la matemática de reparto es UNA sola, espejada
    con tests entre contrato (USDC) y backend (puntos). Estos tests corren la
    liquidación del backend contra los MISMOS números de contracts/test/Bet.t.sol.
    Los puntos son ENTEROS (granularidad 1 pt): misma fórmula que el contrato
    (comisión topeada, mulDiv floor), el dust absorbe el truncamiento.          */

import { describe, it, expect } from "vitest";
import { computeResolution, computeClaimPayout, PLATFORM_BPS, FLASH_REBATE_BPS } from "../src/settlement";

const NO = 0 as const;
const SI = 1 as const;

// pareja del contrato: SI = 70 (alice 20, bob 50), NO = 60 (carol). fee 10%.
const stakesPareja = [
  { userId: "alice", option: SI, amount: 20 },
  { userId: "bob", option: SI, amount: 50 },
  { userId: "carol", option: NO, amount: 60 },
];

describe("caso pareja en puntos enteros (espejo de test_EvenCase)", () => {
  const r = computeResolution({ creatorBps: 700, relampago: false }, stakesPareja, SI);

  it("resuelve (hay contienda)", () => {
    expect(r.kind).toBe("resolved");
  });

  it("comisión 10% de 130 = 13 pts", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    expect(r.totalCommission).toBe(13);
  });

  it("payouts floor: alice 33, bob 83 (misma fórmula, granularidad 1 pt)", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    expect(r.payouts).toEqual([
      { userId: "alice", amount: 33 },
      { userId: "bob", amount: 83 },
    ]);
  });

  it("ganador nunca cobra menos que su stake", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    expect(r.payouts[0].amount).toBeGreaterThanOrEqual(20);
    expect(r.payouts[1].amount).toBeGreaterThanOrEqual(50);
  });

  it("split floor: plataforma 3, creador 10 (creador se lleva el resto, como el contrato)", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    expect(r.platformCut).toBe(3);
    expect(r.creatorCut).toBe(10);
  });

  it("el pozo cierra exacto: payouts + comisión + dust = total", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    const paid = r.payouts.reduce((a, p) => a + p.amount, 0);
    expect(paid + r.platformCut + r.creatorCut + r.dust).toBe(130);
    expect(r.dust).toBeGreaterThanOrEqual(0);
  });
});

describe("caso pareja en micro-unidades (números EXACTOS del contrato)", () => {
  // mismas funciones, montos en unidades de 6 decimales → deben salir los
  // números del test de Foundry al dígito.
  const stakes = [
    { userId: "alice", option: SI, amount: 20_000_000 },
    { userId: "bob", option: SI, amount: 50_000_000 },
    { userId: "carol", option: NO, amount: 60_000_000 },
  ];
  const r = computeResolution({ creatorBps: 700, relampago: false }, stakes, SI);

  it("33_428_571 / 83_571_428, dust 1, split 3_900_000 / 9_100_000", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    expect(r.totalCommission).toBe(13_000_000);
    expect(r.payouts).toEqual([
      { userId: "alice", amount: 33_428_571 },
      { userId: "bob", amount: 83_571_428 },
    ]);
    expect(r.dust).toBe(1);
    expect(r.platformCut).toBe(3_900_000);
    expect(r.creatorCut).toBe(9_100_000);
  });
});

describe("caso despareja (espejo de test_LopsidedCase)", () => {
  const stakes = [
    { userId: "alice", option: SI, amount: 120 },
    { userId: "carol", option: NO, amount: 10 },
  ];
  const r = computeResolution({ creatorBps: 700, relampago: false }, stakes, SI);

  it("comisión topeada al pozo perdedor: 10, no 13", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    expect(r.totalCommission).toBe(10);
  });

  it("el ganador recupera EXACTO su stake", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    expect(r.payouts).toEqual([{ userId: "alice", amount: 120 }]);
    expect(r.dust).toBe(0);
  });
});

describe("bonus relámpago (REGLA INVIOLABLE: el total no cambia)", () => {
  const r = computeResolution({ creatorBps: 700, relampago: true }, stakesPareja, SI);
  const rNormal = computeResolution({ creatorBps: 700, relampago: false }, stakesPareja, SI);

  it("misma comisión total y mismos payouts que el no-relámpago", () => {
    if (r.kind !== "resolved" || rNormal.kind !== "resolved") throw new Error("no resolvió");
    expect(r.totalCommission).toBe(rNormal.totalCommission);
    expect(r.payouts).toEqual(rNormal.payouts);
    expect(r.dust).toBe(rNormal.dust);
  });

  it("la plataforma cede 2pp: share efectivo 1% (300-200 de 1000 bps)", () => {
    if (r.kind !== "resolved") throw new Error("no resolvió");
    // comm 13, platformShare 100/1000 → mulDiv floor = 1; creador 12
    expect(r.platformCut).toBe(1);
    expect(r.creatorCut).toBe(12);
    expect(r.platformCut + r.creatorCut).toBe(r.totalCommission);
  });
});

describe("sin contraparte → anulación con devolución completa", () => {
  const stakes = [
    { userId: "alice", option: SI, amount: 20 },
    { userId: "bob", option: SI, amount: 50 },
  ];
  const r = computeResolution({ creatorBps: 700, relampago: false }, stakes, SI);

  it("cancela y devuelve TODO, sin comisión", () => {
    expect(r.kind).toBe("cancelled");
    if (r.kind !== "cancelled") throw new Error("no canceló");
    expect(r.refunds).toEqual([
      { userId: "alice", amount: 20 },
      { userId: "bob", amount: 50 },
    ]);
  });

  it("también cancela si gana la opción vacía o pierde la vacía (da igual el lado)", () => {
    const r2 = computeResolution({ creatorBps: 700, relampago: false }, stakes, NO);
    expect(r2.kind).toBe("cancelled");
  });
});

describe("computeClaimPayout (pull individual, mismo número que la resolución)", () => {
  it("coincide con el payout calculado en la resolución", () => {
    const r = computeResolution({ creatorBps: 700, relampago: false }, stakesPareja, SI);
    if (r.kind !== "resolved") throw new Error("no resolvió");
    for (const p of r.payouts) {
      expect(computeClaimPayout(stakesPareja, SI, p.userId, 1000)).toBe(p.amount);
    }
  });

  it("perdedor: 0", () => {
    expect(computeClaimPayout(stakesPareja, SI, "carol", 1000)).toBe(0);
  });
});

describe("invariantes con montos arbitrarios (fuzz determinístico)", () => {
  let s = 1234;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648), s / 2147483648);

  it("500 escenarios: nadie cobra de menos, el pozo cierra exacto", () => {
    for (let i = 0; i < 500; i++) {
      const nA = 1 + Math.floor(rnd() * 4);
      const nB = 1 + Math.floor(rnd() * 4);
      const stakes = [
        ...Array.from({ length: nA }, (_, k) => ({ userId: `a${k}`, option: SI, amount: 5 + Math.floor(rnd() * 5000) })),
        ...Array.from({ length: nB }, (_, k) => ({ userId: `b${k}`, option: NO, amount: 5 + Math.floor(rnd() * 5000) })),
      ];
      const creatorBps = Math.floor(rnd() * 1001);
      const relampago = rnd() < 0.5;
      const r = computeResolution({ creatorBps, relampago }, stakes, SI);
      if (r.kind !== "resolved") throw new Error("debería resolver");

      const total = stakes.reduce((a, x) => a + x.amount, 0);
      const paid = r.payouts.reduce((a, p) => a + p.amount, 0);
      expect(paid + r.platformCut + r.creatorCut + r.dust).toBe(total);
      expect(r.platformCut + r.creatorCut).toBe(r.totalCommission);
      for (const st of stakes.filter((x) => x.option === SI)) {
        const pay = r.payouts.find((p) => p.userId === st.userId)!.amount;
        expect(pay).toBeGreaterThanOrEqual(st.amount); // ganador nunca pierde
      }
    }
  });
});
