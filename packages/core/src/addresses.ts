/*  Direcciones de los contratos por red. Fase 3: SOLO testnet Amoy.
    Deployados el 2026-07-05 con las comisiones fijas del dueño
    (normal 3+7, relámpago 1+9, total siempre 10%) y grace 4 h.
    JAMÁS agregar acá una mainnet sin auditoría + luz verde legal (CLAUDE.md). */

export const AMOY = {
  chainId: 80002,
  // dRPC: el RPC oficial (rpc-amoy.polygon.technology) limita getLogs a <900
  // bloques y se cuelga con rangos grandes; dRPC banca 20k bloques en <1s.
  rpcUrl: "https://polygon-amoy.drpc.org",
  /** MockUSDC — 6 decimales, mint ABIERTO. Solo existe para testnet. */
  usdc: "0xb5e00AAD4523665636F5465c77D1D506C3A993D8",
  /** BetFactory — crea cada Bet e inyecta el split de comisión según isFlash. */
  betFactory: "0xa93D1967BbB16d219242Dd43Ee94a276f65494e6",
  /** Wallet que deployó (y treasury de testnet). */
  deployer: "0x27E16bEF25fB93E393B8D60C589CA518229C0A0c",
  /** Bloque del deploy de la factory: el indexer arranca desde acá. */
  deployBlock: 41465071,
} as const;
