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
      // decisión del dueño (2026-07-05): el público también es cripto —
      // la wallet entra desde la puerta. La embebida sigue naciendo en
      // "Activar" para el público social.
      loginMethods: ["google", "email", "twitter", "wallet"],
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
