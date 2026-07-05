import { http, createConfig } from "wagmi";
import { polygonAmoy } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { AMOY } from "@bardooo/core";

/* Config de wagmi para la fase 3: SOLO Polygon Amoy, conector injected
   (MetaMask y similares). En fase 4 esto se reemplaza por las wallets
   embebidas de Privy — por eso vive aislado acá.                        */
export const wagmiConfig = createConfig({
  chains: [polygonAmoy],
  connectors: [injected()],
  transports: {
    [polygonAmoy.id]: http(AMOY.rpcUrl),
  },
});
