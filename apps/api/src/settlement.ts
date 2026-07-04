/*  Liquidación de duelos de PUNTOS — funciones PURAS (sin DB).
    La matemática viene entera de @bardooo/core (espejo del contrato):
    comisión sobre el total topeada al pozo perdedor, reparto proporcional con
    mulDiv floor, split plataforma/creador proporcional a bps. Los puntos son
    enteros: el truncamiento queda en `dust` (el pozo SIEMPRE cierra exacto).
    Verificado contra los números de contracts/test/Bet.t.sol en
    test/settlement.test.ts. NO tocar sin actualizar los tests espejo.         */

import { commission, payoutFor, feeSplit } from "@bardooo/core";

export const PLATFORM_BPS = 300; // 3% — en fase 3 se lee de factory.platformFeeBps()
export const FLASH_REBATE_BPS = 200; // relámpago: BARDOOO cede 2pp al creador (cobra 1%)
export const MAX_CREATOR_BPS = 1000; // techo 10%

export interface StakeIn {
  userId: string;
  option: number; // 0 NO / 1 SI
  amount: number; // puntos enteros
}

export type Resolution =
  | { kind: "cancelled"; refunds: { userId: string; amount: number }[] }
  | {
      kind: "resolved";
      totalCommission: number;
      platformCut: number; // en puntos es un "sink" (no hay cuenta de plataforma)
      creatorCut: number; // se acredita al creador en la misma transacción
      payouts: { userId: string; amount: number }[]; // se acreditan al cobrar (pull)
      dust: number;
    };

function pools2(stakes: StakeIn[]): [bigint, bigint] {
  const p: [bigint, bigint] = [0n, 0n];
  for (const s of stakes) p[s.option] += BigInt(s.amount);
  return p;
}

/** Qué produce resolver un duelo. Anulación automática sin contraparte
 *  (espejo de Bet.resolve + _hasContest del contrato). */
export function computeResolution(
  bet: { creatorBps: number; relampago: boolean },
  stakes: StakeIn[],
  winningOption: number
): Resolution {
  const pools = pools2(stakes);

  // sin contienda (dinero en menos de 2 opciones) → se devuelve todo, sin comisión
  if (pools[0] === 0n || pools[1] === 0n) {
    return {
      kind: "cancelled",
      refunds: stakes.map((s) => ({ userId: s.userId, amount: s.amount })),
    };
  }

  const feeBps = PLATFORM_BPS + bet.creatorBps;
  const total = pools[0] + pools[1];
  const comm = commission(total, pools[winningOption], feeBps);

  // bonus relámpago: cambia SOLO el split, jamás el total que sale del pozo
  const platformShare = bet.relampago ? PLATFORM_BPS - FLASH_REBATE_BPS : PLATFORM_BPS;
  const { platformCut, creatorCut } = feeSplit(comm, platformShare, feeBps);

  const payouts = stakes
    .filter((s) => s.option === winningOption)
    .map((s) => ({
      userId: s.userId,
      amount: Number(payoutFor(pools, winningOption, BigInt(s.amount), feeBps)),
    }));

  const net = total - comm;
  const paid = payouts.reduce((a, p) => a + BigInt(p.amount), 0n);

  return {
    kind: "resolved",
    totalCommission: Number(comm),
    platformCut: Number(platformCut),
    creatorCut: Number(creatorCut),
    payouts,
    dust: Number(net - paid),
  };
}

/** Payout individual (pull): mismo número que computeResolution para ese user. */
export function computeClaimPayout(
  stakes: StakeIn[],
  winningOption: number,
  userId: string,
  feeBps: number
): number {
  const pools = pools2(stakes);
  const mine = stakes
    .filter((s) => s.userId === userId && s.option === winningOption)
    .reduce((a, s) => a + BigInt(s.amount), 0n);
  if (mine === 0n) return 0;
  return Number(payoutFor(pools, winningOption, mine, feeBps));
}
