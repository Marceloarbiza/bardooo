/*  LA matemática de BARDOOO — espejo EXACTO de contracts/P2PBetting.sol.
    Reglas bloqueadas (CLAUDE.md, no cambiar sin consultar al dueño):
      - Comisión sobre el TOTAL apostado, topeada al pozo perdedor:
        commission = min(bps * total / 10000, pozoPerdedor)
      - Reparto proporcional: payout = stake * neto / poteGanador,
        multiplicando antes de dividir y truncando hacia abajo (mulDiv).
        El dust queda en el pozo -> el pozo SIEMPRE es solvente.
      - Split plataforma/creador proporcional a sus bps, exacto (sin pérdida).
    Unidades: enteros de 6 decimales (1 USDC = 1_000_000n), bigint.
    Verificado contra los números de contracts/test/Bet.t.sol en test/math.test.ts. */

export const UNIT = 1_000_000n; // 1 USDC (o 1 punto) en unidades mínimas
export const BPS_DENOMINATOR = 10_000n;

/** floor(a * b / d) sin overflow intermedio — espejo de Math.mulDiv del contrato. */
export function mulDiv(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("mulDiv: división por cero");
  return (a * b) / d; // bigint trunca hacia cero; con operandos >= 0 es floor
}

/** Comisión total: bps sobre el total, TOPEADA al pozo perdedor.
 *  Espejo de Bet.totalCommission(). */
export function commission(totalPool: bigint, winningPool: bigint, feeBps: number | bigint): bigint {
  const gross = mulDiv(totalPool, BigInt(feeBps), BPS_DENOMINATOR);
  const losing = totalPool - winningPool;
  return gross > losing ? losing : gross;
}

/** Cuánto cobra un stake del lado ganador: stake * neto / poteGanador (floor).
 *  Espejo de Bet.claim() / Bet.previewPayout(). pools indexado por opción. */
export function payoutFor(
  pools: readonly bigint[],
  option: number,
  stakeOnOption: bigint,
  feeBps: number | bigint
): bigint {
  const total = pools.reduce((acc, p) => acc + p, 0n);
  const winningPool = pools[option];
  if (winningPool === undefined || winningPool <= 0n) return 0n;
  const net = total - commission(total, winningPool, feeBps);
  return mulDiv(stakeOnOption, net, winningPool);
}

/** Multiplicador implícito del pozo: cuánto paga hoy 1 unidad en esa opción.
 *  Devuelve un número (es SOLO para mostrar en la UI, nunca para liquidar). */
export function multFor(
  pools: readonly bigint[],
  option: number,
  feeBps: number | bigint
): number | null {
  const total = pools.reduce((acc, p) => acc + p, 0n);
  const winningPool = pools[option];
  if (winningPool === undefined || winningPool <= 0n || total <= 0n) return null;
  const net = total - commission(total, winningPool, feeBps);
  return Number(net) / Number(winningPool);
}

/** Reparto de la comisión entre plataforma y creador, proporcional a sus bps.
 *  Espejo de Bet.withdrawFees(): platformCut = mulDiv(comm, platformBps, totalBps),
 *  creador se lleva el resto (split exacto, sin pérdida).
 *  Para el bonus relámpago se pasa el share EFECTIVO de plataforma
 *  (PLATFORM_BPS - FLASH_REBATE_BPS); el total repartido no cambia jamás. */
export function feeSplit(
  commissionAmount: bigint,
  platformShareBps: number | bigint,
  totalBps: number | bigint
): { platformCut: bigint; creatorCut: bigint } {
  const tb = BigInt(totalBps);
  if (tb === 0n) return { platformCut: 0n, creatorCut: 0n };
  const platformCut = mulDiv(commissionAmount, BigInt(platformShareBps), tb);
  return { platformCut, creatorCut: commissionAmount - platformCut };
}
