/*  Direcciones de los contratos por red. Fase 3: SOLO testnet Amoy.
    Deployados el 2026-07-05 con las comisiones fijas del dueño
    (normal 3+7, relámpago 1+9, total siempre 10%) y grace 4 h.
    JAMÁS agregar acá una mainnet sin auditoría + luz verde legal (CLAUDE.md). */

export const AMOY = {
  chainId: 80002,
  // dRPC: el RPC oficial (rpc-amoy.polygon.technology) limita getLogs a <900
  // bloques y se cuelga con rangos grandes; dRPC banca 20k bloques en <1s.
  rpcUrl: "https://polygon-amoy.drpc.org",
  /** MockUSDC — 6 decimales, mint ABIERTO, con ERC20Permit (fase 4).
   *  Solo existe para testnet. */
  usdc: "0x01Df2c4E9a8017929F8Ab09bbf157F6bb2C54B58",
  /** BetFactory — crea cada Bet e inyecta el split de comisión según isFlash.
   *  Confía en el forwarder: los Bets aceptan meta-transacciones. */
  betFactory: "0xEcAB252e657E47e59eAC67e52b2Ba7E24f1AeDA1",
  /** ERC2771Forwarder "BardoooForwarder" (fase 4, gasless). */
  forwarder: "0x7fdcDfD287eB7EdDC38Fd5b7e69Ba3d9aF594386",
  /** Wallet que deployó (treasury de testnet Y relayer del gasless). */
  deployer: "0x27E16bEF25fB93E393B8D60C589CA518229C0A0c",
  /** Bloque del deploy de la factory: el indexer arranca desde acá. */
  deployBlock: 41613582,
} as const;
