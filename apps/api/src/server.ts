import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { prisma } from "./db";
import { ApiError, errors } from "./errors";
import type { TokenVerifier } from "./auth";
import { getOrCreateUser, updateName, serializeUser } from "./services/users";
import {
  listPublicBets, getBet, createBet, placeBet, resolveBet, claimBet, refundBet, cancelBet,
} from "./services/bets";
import { startFlight, endFlight, flightsLeft } from "./services/ficha";
import { useReferralCode } from "./services/referrals";
import { PLATFORM_BPS, FLASH_REBATE_BPS, MAX_CREATOR_BPS } from "./settlement";

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
    app.log.error(err);
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
  app.get("/config", async () => ({
    platformBps: PLATFORM_BPS,
    flashRebateBps: FLASH_REBATE_BPS,
    maxCreatorBps: MAX_CREATOR_BPS,
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

  /* ------------------------------ apuestas ------------------------------ */

  const createSchema = z.object({
    question: z.string(),
    currency: z.enum(["pts", "usdc"]).default("pts"),
    stakeMode: z.enum(["free", "fixed", "capped"]).default("free"),
    fixedAmount: z.number().optional(),
    minStake: z.number().optional(),
    maxStake: z.number().optional(),
    maxBettors: z.number().optional(),
    creatorBps: z.number().int(),
    isPrivate: z.boolean().optional(),
    code: z.string().max(12).optional(),
    closeTime: z.number().optional(),
    resolveTime: z.number().optional(),
    relampago: z.boolean().optional(),
    windowMin: z.number().optional(),
  });

  app.post("/bets", async (req) => {
    const user = requireUser(req);
    return { bet: await createBet(user.id, createSchema.parse(req.body)) };
  });

  app.post("/bets/:id/place", async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const { option, amount } = z.object({ option: z.number().int(), amount: z.number() }).parse(req.body);
    return { bet: await placeBet(user.id, id, option, amount) };
  });

  app.post("/bets/:id/resolve", async (req) => {
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

  /* ------------------------------ referidos ------------------------------ */

  app.post("/referrals/use", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
    const user = requireUser(req);
    const { code } = z.object({ code: z.string().min(1).max(40) }).parse(req.body);
    return await useReferralCode(user.id, code);
  });

  return app;
}
