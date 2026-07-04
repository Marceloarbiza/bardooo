import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import { C } from "./theme";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

createRoot(document.getElementById("root")).render(
  <PrivyProvider
    appId={PRIVY_APP_ID}
    config={{
      // login social/email: la wallet NO es la puerta de entrada (CLAUDE.md);
      // las wallets embebidas llegan en fase 4 con "Activá tu saldo"
      loginMethods: ["google", "email", "twitter"],
      appearance: {
        theme: "dark",
        accentColor: C.si,
      },
      embeddedWallets: { createOnLogin: "off" },
    }}
  >
    <App />
  </PrivyProvider>
);
