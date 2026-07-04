/*  Conversión entre números "de pantalla" (20, 33.428571) y unidades enteras
    de 6 decimales (20_000_000n). Equivale a parseUnits/formatUnits(x, 6).     */

const DECIMALS = 6;
const SCALE = 10 ** DECIMALS;

/** Número de pantalla -> unidades enteras. Redondea a 6 decimales (más precisión
 *  que eso no existe ni en USDC ni en puntos). */
export function toUnits(amount: number): bigint {
  if (!Number.isFinite(amount)) return 0n;
  return BigInt(Math.round(amount * SCALE));
}

/** Unidades enteras -> número de pantalla. */
export function fromUnits(units: bigint): number {
  return Number(units) / SCALE;
}
