import { http } from "wagmi";
import { polygonAmoy } from "wagmi/chains";
import { createConfig } from "@privy-io/wagmi";
import { AMOY } from "@bardooo/core";

/* Config de wagmi VIA PRIVY (fase 4): las wallets de Privy — la embebida que
   nace del login Y las externas (MetaMask) — entran al flujo wagmi existente.
   ChainBettingService no distingue: firma igual con cualquiera.              */
export const wagmiConfig = createConfig({
  chains: [polygonAmoy],
  transports: {
    [polygonAmoy.id]: http(AMOY.rpcUrl),
  },
});
