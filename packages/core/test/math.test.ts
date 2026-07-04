/*  Tests SAGRADOS de @bardooo/core.
    Espejo exacto de contracts/test/Bet.t.sol — si estos números divergen del
    contrato, TODO lo demás está mal (usuarios estafados). No "arreglar" los
    valores esperados: si un test falla, el bug está en la implementación.
    Unidades: enteros de 6 decimales (1 USDC = 1_000_000), bigint.            */

import { describe, it, expect } from "vitest";
import {
  commission,
  payoutFor,
  feeSplit,
  multFor,
  toUnits,
  fromUnits,
  displayCommission,
  displayPayoutFor,
  displayMultFor,
  displayFeeSplit,
} from "../src/index";

const U = (n: number) => toUnits(n); // n USDC -> unidades de 6 decimales

const NO = 0;
const SI = 1;
const PLATFORM_BPS = 300;
const FLASH_REBATE_BPS = 200;

/* ------------------- caso pareja (test_EvenCase de Bet.t.sol) -------------------
   SI = 70 (alice 20, bob 50), NO = 60 (carol). Fee total 10% (3% + 7%).
   total 130, comision 13 <= perdedor 60 -> neto 117.
   alice: 20e6*117e6/70e6 = 33_428_571 ; bob: 50e6*117e6/70e6 = 83_571_428.
   dust = 117e6 - (33_428_571 + 83_571_428) = 1 unidad.                        */
describe("caso pareja (espejo de test_EvenCase_ExactPayoutsAndDust)", () => {
  const pools: [bigint, bigint] = [U(60), U(70)]; // [NO, SI]
  const feeBps = 1000; // 3% plataforma + 7% creador

  it("comisión = 10% de 130 = 13 USDC exactos", () => {
    expect(commission(U(130), U(70), feeBps)).toBe(13_000_000n);
  });

  it("alice (20 al SÍ) cobra exactamente 33_428_571", () => {
    expect(payoutFor(pools, SI, U(20), feeBps)).toBe(33_428_571n);
  });

  it("bob (50 al SÍ) cobra exactamente 83_571_428", () => {
    expect(payoutFor(pools, SI, U(50), feeBps)).toBe(83_571_428n);
  });

  it("dust = 1 unidad (el contrato queda solvente, nunca debe)", () => {
    const net = U(130) - commission(U(130), U(70), feeBps);
    const paid = payoutFor(pools, SI, U(20), feeBps) + payoutFor(pools, SI, U(50), feeBps);
    expect(net - paid).toBe(1n);
  });

  it("ganadores nunca cobran menos que su stake", () => {
    expect(payoutFor(pools, SI, U(20), feeBps)).toBeGreaterThanOrEqual(U(20));
    expect(payoutFor(pools, SI, U(50), feeBps)).toBeGreaterThanOrEqual(U(50));
  });

  it("split de comisión: plataforma 300/1000 de 13 = 3.9 ; creador 9.1", () => {
    const { platformCut, creatorCut } = feeSplit(13_000_000n, PLATFORM_BPS, 1000);
    expect(platformCut).toBe(3_900_000n);
    expect(creatorCut).toBe(9_100_000n);
    expect(platformCut + creatorCut).toBe(13_000_000n); // split exacto, sin pérdida
  });
});

/* ---------------- caso despareja (test_LopsidedCase de Bet.t.sol) ----------------
   SI = 120 (alice), NO = 10. 10% de 130 = 13 > perdedor 10
   -> comisión topeada a 10. Neto 120: alice recupera EXACTO su stake.          */
describe("caso despareja (espejo de test_LopsidedCase_CommissionCappedToLosingPool)", () => {
  const pools: [bigint, bigint] = [U(10), U(120)];
  const feeBps = 1000;

  it("comisión topeada al pozo perdedor: 10 USDC, no 13", () => {
    expect(commission(U(130), U(120), feeBps)).toBe(10_000_000n);
  });

  it("el ganador nunca pierde: alice recupera sus 120 exactos", () => {
    expect(payoutFor(pools, SI, U(120), feeBps)).toBe(120_000_000n);
  });
});

/* --------------------------- bordes y salvaguardas --------------------------- */
describe("bordes", () => {
  it("pozo ganador vacío -> payout 0 (sin división por cero)", () => {
    expect(payoutFor([U(10), 0n], SI, 0n, 1000)).toBe(0n);
  });

  it("fee 0: no hay comisión, se reparte todo el pozo", () => {
    const pools: [bigint, bigint] = [U(50), U(50)];
    expect(commission(U(100), U(50), 0)).toBe(0n);
    expect(payoutFor(pools, SI, U(50), 0)).toBe(U(100));
  });

  it("multFor: pozo vacío devuelve null; con pozo, neto/ganador", () => {
    expect(multFor([0n, 0n], SI, 1000)).toBeNull();
    // pareja: neto 117 / pozo SI 70 = 1.6714...
    expect(multFor([U(60), U(70)], SI, 1000)).toBeCloseTo(117 / 70, 9);
  });

  it("split relámpago: plataforma cede 2pp (share 1%) — el total NO cambia", () => {
    // comisión 13, totalBps 1000, share efectivo de plataforma 300-200=100
    const { platformCut, creatorCut } = feeSplit(
      13_000_000n,
      PLATFORM_BPS - FLASH_REBATE_BPS,
      1000
    );
    expect(platformCut).toBe(1_300_000n); // BARDOOO cobra solo 1%
    expect(creatorCut).toBe(11_700_000n); // el creador se lleva el resto
    expect(platformCut + creatorCut).toBe(13_000_000n); // REGLA INVIOLABLE: mismo total
  });
});

/* ----------------- invariantes (mini-fuzz determinístico en TS) -----------------
   Espejo acotado del fuzzing externo (~147k escenarios): con montos arbitrarios,
   el ganador nunca cobra menos que su stake y lo pagado nunca supera el pozo.  */
describe("invariantes (fuzz determinístico)", () => {
  // PRNG con semilla fija: mismos casos en cada corrida
  let s = 42;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const rndUnits = () => BigInt(Math.floor(rnd() * 1_000_000_000_000) + 1_000_000); // 1 a 1M USDC

  it("ganador nunca pierde y el pozo siempre es solvente (2000 escenarios)", () => {
    for (let i = 0; i < 2000; i++) {
      const a = rndUnits(); // stake del ganador (único en su lado)
      const c = rndUnits(); // pozo perdedor
      const feeBps = Math.floor(rnd() * 1301); // 0 a 13% (3% + hasta 10%)
      const pools: [bigint, bigint] = [c, a];
      const total = a + c;

      const comm = commission(total, a, feeBps);
      expect(comm).toBeLessThanOrEqual(c); // nunca muerde el pozo ganador

      const pay = payoutFor(pools, SI, a, feeBps);
      expect(pay).toBeGreaterThanOrEqual(a); // ganador nunca pierde

      const { platformCut, creatorCut } = feeSplit(comm, PLATFORM_BPS, PLATFORM_BPS + Math.floor(rnd() * 1000));
      expect(pay + platformCut + creatorCut).toBeLessThanOrEqual(total); // solvencia
      expect(platformCut + creatorCut).toBe(comm); // split exacto
    }
  });
});

/* ------------------- capa display (números para la UI) -------------------
   Los wrappers display convierten a unidades, calculan con LA MISMA
   matemática entera y vuelven a número. Una sola matemática, sin floats
   en el reparto.                                                          */
describe("capa display (delegación a la matemática entera)", () => {
  it("toUnits/fromUnits: ida y vuelta exacta en montos de 6 decimales", () => {
    expect(toUnits(20)).toBe(20_000_000n);
    expect(toUnits(33.428571)).toBe(33_428_571n);
    expect(fromUnits(83_571_428n)).toBeCloseTo(83.571428, 9);
  });

  it("displayPayoutFor reproduce el caso pareja en números", () => {
    expect(displayPayoutFor([60, 70], SI, 20, 1000)).toBeCloseTo(33.428571, 6);
    expect(displayPayoutFor([60, 70], SI, 50, 1000)).toBeCloseTo(83.571428, 6);
  });

  it("displayCommission reproduce el tope al pozo perdedor", () => {
    expect(displayCommission(130, 120, 1000)).toBe(10);
    expect(displayCommission(130, 70, 1000)).toBe(13);
  });

  it("displayMultFor coincide con multFor entero", () => {
    expect(displayMultFor([60, 70], SI, 1000)).toBeCloseTo(117 / 70, 9);
    expect(displayMultFor([0, 0], SI, 1000)).toBeNull();
  });

  it("displayFeeSplit: 3.9 / 9.1 en el caso pareja", () => {
    const { platformCut, creatorCut } = displayFeeSplit(13, PLATFORM_BPS, 1000);
    expect(platformCut).toBeCloseTo(3.9, 9);
    expect(creatorCut).toBeCloseTo(9.1, 9);
  });
});
