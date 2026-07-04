/*  Capa "display": la misma matemática entera, con números de pantalla en la
    entrada y la salida. Es lo que consume el frontend (y cualquier UI futura).
    REGLA DE ORO: acá NO hay fórmulas propias — todo delega en math.ts. Si la
    UI y el contrato divergen, los usuarios cobran mal.                        */

import { commission, payoutFor, multFor, feeSplit } from "./math";
import { toUnits, fromUnits } from "./units";

export function displayCommission(total: number, winningPool: number, feeBps: number): number {
  return fromUnits(commission(toUnits(total), toUnits(winningPool), feeBps));
}

export function displayPayoutFor(
  pools: readonly number[],
  option: number,
  stakeOnOption: number,
  feeBps: number
): number {
  return fromUnits(payoutFor(pools.map(toUnits), option, toUnits(stakeOnOption), feeBps));
}

export function displayMultFor(
  pools: readonly number[],
  option: number,
  feeBps: number
): number | null {
  return multFor(pools.map(toUnits), option, feeBps);
}

export function displayFeeSplit(
  commissionAmount: number,
  platformShareBps: number,
  totalBps: number
): { platformCut: number; creatorCut: number } {
  const { platformCut, creatorCut } = feeSplit(toUnits(commissionAmount), platformShareBps, totalBps);
  return { platformCut: fromUnits(platformCut), creatorCut: fromUnits(creatorCut) };
}
