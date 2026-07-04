import "dotenv/config";
import { buildServer } from "./server";
import { makePrivyVerifier } from "./auth";
import { expireOverdueRelampagos } from "./services/bets";

const PORT = Number(process.env.PORT || 3001);

const appId = process.env.PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
if (!appId || !appSecret) {
  throw new Error("Faltan PRIVY_APP_ID / PRIVY_APP_SECRET (ver apps/api/.env.example)");
}

const app = await buildServer({
  verifyToken: makePrivyVerifier(appId, appSecret),
  corsOrigin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
});

// cron: cada minuto se anulan (y devuelven) los relámpagos vencidos
setInterval(() => {
  expireOverdueRelampagos().catch((e) => console.error("cron relampagos:", e));
}, 60_000);

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`BARDOOO api escuchando en http://localhost:${PORT}`);
