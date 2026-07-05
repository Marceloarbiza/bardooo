import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { C } from "./theme";
import { wagmiConfig } from "./lib/wagmi";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
const queryClient = new QueryClient();

createRoot(document.getElementById("root")).render(
  <PrivyProvider
    appId={PRIVY_APP_ID}
    config={{
      // login social/email: la wallet NO es la puerta de entrada (CLAUDE.md).
      // La embebida se crea recién al tocar "Activar" (la graduación).
      loginMethods: ["google", "email", "twitter"],
      appearance: {
        theme: "dark",
        accentColor: C.si,
      },
      embeddedWallets: { createOnLogin: "off" },
    }}
  >
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <App />
      </WagmiProvider>
    </QueryClientProvider>
  </PrivyProvider>
);
