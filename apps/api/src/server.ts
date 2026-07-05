import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { getAddress, verifyMessage } from "viem";
import { relayEnabled, relayExecute, faucetMint } from "./relay";
import { prisma } from "./db";
import { ApiError, errors } from "./errors";
import type { TokenVerifier } from "./auth";
import { getOrCreateUser, updateName, serializeUser } from "./services/users";
import {
  listPublicBets, getBet, createBet, placeBet, resolveBet, claimBet, refundBet, cancelBet,
} from "./services/bets";
import { startFlight, endFlight, flightsLeft } from "./services/ficha";
import { useReferralCode } from "./services/referrals";
import { PLATFORM_BPS, CREATOR_BPS, FLASH_PLATFORM_BPS, FLASH_CREATOR_BPS, FLASH_REBATE_BPS } from "./settlement";

declare module "fastify" {
  interface FastifyRequest {
    user: { id: string; handle: string } | null;
  }
}

export interface ServerOpts {
  verifyToken: TokenVerifier;
  corsOrigin?: string | string[];
}

export async function buildServer(opts: ServerOpts) {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: opts.corsOrigin ?? true });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError)
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    if (err instanceof z.ZodError)
      return reply.status(400).send({ error: "BAD_REQUEST", message: "Datos inválidos" });
    if ((err as any).statusCode === 429)
      return reply.status(429).send({ error: "RATE_LIMIT", message: "Demasiados intentos, esperá un toque" });
    // errores 4xx del propio Fastify (ej. body JSON vacío/malformado): NO son
    // nuestros 500 — devolver su status real en vez de "algo se rompió"
    const sc = (err as any).statusCode;
    if (typeof sc === "number" && sc >= 400 && sc < 500)
      return reply.status(sc).send({ error: "BAD_REQUEST", message: "Pedido inválido" });
    console.error("500:", err); // logger está apagado: que al menos quede en stdout
    return reply.status(500).send({ error: "INTERNAL", message: "Algo se rompió de nuestro lado" });
  });

  /* ---- auth: resuelve (o crea) el usuario a partir del token de Privy ---- */
  app.decorateRequest("user", null);
  app.addHook("preHandler", async (req) => {
    req.user = null;
    if (!req.headers.authorization) return;
    const { privyId, nameHint } = await opts.verifyToken(req.headers.authorization);
    // el front manda el nombre de Privy (google/email) URI-encoded; solo se usa
    // en el PRIMER login, para el alta (después el nombre vive en la DB)
    let headerHint: string | undefined;
    const raw = req.headers["x-name-hint"];
    if (typeof raw === "string" && raw) {
      try { headerHint = decodeURIComponent(raw); } catch { headerHint = undefined; }
    }
    const u = await getOrCreateUser(privyId, nameHint ?? headerHint);
    req.user = { id: u.id, handle: u.handle };
  });
  const requireUser = (req: { user: { id: string; handle: string } | null }) => {
    if (!req.user) throw errors.unauthorized();
    return req.user;
  };

  /* ------------------------------ público ------------------------------ */

  app.get("/health", async () => ({ ok: true }));

  // el front lee esto en vez de hardcodear PLATFORM_BPS (trampa conocida de CLAUDE.md)
  // comisiones FIJAS (2026-07-05): normal 3+7, relámpago 1+9 — total SIEMPRE 10%
  app.get("/config", async () => ({
    platformBps: PLATFORM_BPS,
    creatorBps: CREATOR_BPS,
    flashPlatformBps: FLASH_PLATFORM_BPS,
    flashCreatorBps: FLASH_CREATOR_BPS,
    flashRebateBps: FLASH_REBATE_BPS,
  }));

  app.get("/bets", async (req) => ({ bets: await listPublicBets(req.user?.id) }));

  app.get("/bets/:id", async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    return { bet: await getBet(id, req.user?.id) };
  });

  // desbloqueo de privadas con código: SIEMPRE server-side, nunca viaja el código real
  app.post("/bets/:id/unlock", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { code } = z.object({ code: z.string().max(12) }).parse(req.body);
    return { bet: await getBet(id, req.user?.id, code) };
  });

  // ticker/feed real: últimas 24 h de actividad PÚBLICA
  app.get("/activity", async () => {
    const items = await prisma.activity.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return {
      activity: items.map((a) => ({
        type: a.type, u: a.userHandle, betId: a.betId, amt: a.amount, side: a.side,
        cur: a.currency, t: a.createdAt.getTime(),
      })),
    };
  });

  /* ------------------------------ sesión ------------------------------ */

  app.get("/me", async (req) => {
    const user = requireUser(req);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { user: serializeUser(u), flightsLeft: await flightsLeft(u.id) };
  });

  app.patch("/me", async (req) => {
    const user = requireUser(req);
    const { name } = z.object({ name: z.string().trim().min(1).max(20) }).parse(req.body);
    return { user: serializeUser(await updateName(user.id, name)) };
  });

  // Vincular wallet (fase 3): el usuario FIRMA un mensaje con su wallet y acá
  // se verifica la firma — nadie vincula una wallet ajena. La wallet vinculada
  // habilita el espejo automático (crear on-chain crea también el gemelo pts)
  // y que sus apuestas on-chain aparezcan con su bicho y no como sombra.
  app.post("/me/wallet", async (req) => {
    const user = requireUser(req);
    const { address, signature } = z
      .object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), signature: z.string() })
      .parse(req.body);
    const wallet = getAddress(address);

    const taken = await prisma.user.findFirst({
      where: { walletAddr: { equals: wallet, mode: "insensitive" }, id: { not: user.id } },
    });
    if (taken) throw errors.walletTaken();

    const message = `BARDOOO: vinculo la wallet ${wallet.toLowerCase()} a mi cuenta ${user.handle}`;
    const ok = await verifyMessage({ address: wallet, message, signature: signature as `0x${string}` }).catch(() => false);
    if (!ok) throw errors.badSignature();

    const updated = await prisma.user.update({ where: { id: user.id }, data: { walletAddr: wallet } });
    return { user: serializeUser(updated) };
  });

  /* ------------------------------ apuestas ------------------------------ */

  const createSchema = z.object({
    question: z.string(),
    currency: z.enum(["pts", "usdc"]).default("pts"),
    stakeMode: z.enum(["free", "fixed", "capped"]).default("free"),
    fixedAmount: z.number().optional(),
    minStake: z.number().optional(),
    maxStake: z.number().optional(),
    maxBettors: z.number().optional(),
    creatorBps: z.number().int().optional(), // DEPRECADO: se ignora (comisión fija)
    isPrivate: z.boolean().optional(),
    code: z.string().max(12).optional(),
    closeTime: z.number().optional(),
    resolveTime: z.number().optional(),
    relampago: z.boolean().optional(),
    windowMin: z.number().optional(),
  });

  // límites finos (fase 5): crear y resolver son acciones caras/sensibles
  app.post("/bets", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    return { bet: await createBet(user.id, createSchema.parse(req.body)) };
  });

  app.post("/bets/:id/place", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { option, amount } = z.object({ option: z.number().int(), amount: z.number() }).parse(req.body);
    return { bet: await placeBet(user.id, id, option, amount) };
  });

  app.post("/bets/:id/resolve", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { option } = z.object({ option: z.number().int() }).parse(req.body);
    return await resolveBet(user.id, id, option);
  });

  app.post("/bets/:id/claim", async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    return await claimBet(user.id, id);
  });

  app.post("/bets/:id/refund", async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    return await refundBet(user.id, id);
  });

  app.post("/bets/:id/cancel", async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    return await cancelBet(user.id, id);
  });

  /* ------------------------------ La Ficha ------------------------------ */

  app.post("/ficha/start", async (req) => {
    const user = requireUser(req);
    return await startFlight(user.id);
  });

  app.post("/ficha/end", async (req) => {
    const user = requireUser(req);
    const { flightId, score } = z.object({ flightId: z.string(), score: z.number() }).parse(req.body);
    return await endFlight(user.id, flightId, score);
  });

  /* ---- embudo (fase 5): hitos no derivables de otras tablas (hoy: share) ---- */
  app.post("/events", async (req) => {
    const user = requireUser(req);
    const { kind } = z.object({ kind: z.enum(["share"]) }).parse(req.body);
    // solo la PRIMERA vez cuenta (unique); repetir es no-op
    await prisma.funnelEvent.createMany({
      data: [{ userId: user.id, kind }],
      skipDuplicates: true,
    });
    return { ok: true };
  });

  /* --------------------- gasless (fase 4): relay + faucet --------------------- */

  // el front pregunta si el modo sin gas está prendido
  app.get("/relay/status", async () => ({ enabled: relayEnabled() }));

  // meta-transacción firmada → la plataforma paga el gas (candados en relay.ts)
  app.post("/relay", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req) => {
    requireUser(req); // solo usuarios logueados gastan nuestro gas
    const body = z.object({
      from: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      value: z.string().default("0"),
      gas: z.string(),
      deadline: z.number().int(),
      data: z.string(),
      signature: z.string(),
    }).parse(req.body);
    return await relayExecute(body);
  });

  // faucet de testnet sin gas: la plataforma mintea los 500 mUSDC
  app.post("/faucet", { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (req) => {
    const user = requireUser(req);
    const { address } = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(req.body);
    // solo a tu propia wallet vinculada: nadie farmea mints para terceros
    const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!me.walletAddr || me.walletAddr.toLowerCase() !== address.toLowerCase())
      throw errors.badSignature();
    return await faucetMint(address);
  });

  /* ------------------------------ referidos ------------------------------ */

  app.post("/referrals/use", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const { code } = z.object({ code: z.string().min(1).max(40) }).parse(req.body);
    return await useReferralCode(user.id, code);
  });

  return app;
}
