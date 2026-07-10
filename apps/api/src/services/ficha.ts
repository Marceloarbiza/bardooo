import { prisma } from "../db";
import { errors } from "../errors";
import { accreditIfPending } from "./referrals";

/*  La Ficha anti-trampa (PLAN.md): el cliente NUNCA acredita.
    - tope 3 vuelos/día contado en el SERVER (por vuelos INICIADOS: abandonar
      un vuelo lo consume — si no, se farmean tokens en paralelo)
    - score tope 15 (1 pt por caño)
    - duración plausible: ≥ ~1.2 s por caño
    - el premio se acredita al terminar, via ledger                            */

export const MAX_FLIGHTS_PER_DAY = 3;
export const MAX_SCORE = 15;
export const MIN_MS_PER_PIPE = 1200;

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function flightsLeft(userId: string) {
  const used = await prisma.flight.count({ where: { userId, day: dayKey() } });
  return Math.max(0, MAX_FLIGHTS_PER_DAY - used);
}

/** ficha.start → crea el vuelo (el "token" es el id del registro con timestamp server). */
export async function startFlight(userId: string) {
  return prisma.$transaction(async (tx) => {
    const used = await tx.flight.count({ where: { userId, day: dayKey() } });
    if (used >= MAX_FLIGHTS_PER_DAY) throw errors.noFlights();
    const flight = await tx.flight.create({ data: { userId, day: dayKey() } });
    return { flightId: flight.id, remaining: MAX_FLIGHTS_PER_DAY - used - 1 };
  });
}

/** ficha.end → valida token, score y duración; acredita el premio. */
export async function endFlight(userId: string, flightId: string, score: number) {
  score = Math.trunc(score);
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) throw errors.badScore();

  return prisma.$transaction(async (tx) => {
    const flight = await tx.flight.findUnique({ where: { id: flightId } });
    if (!flight || flight.userId !== userId || flight.endedAt) throw errors.badScore();

    const elapsed = Date.now() - flight.startedAt.getTime();
    if (score > 0 && elapsed < score * MIN_MS_PER_PIPE) throw errors.flightTooFast();

    const prize = score; // 1 pt por caño, ya topeado por MAX_SCORE
    await tx.flight.update({
      where: { id: flight.id },
      data: { endedAt: new Date(), score, prize },
    });
    if (prize > 0) {
      await tx.user.update({ where: { id: userId }, data: { points: { increment: prize } } });
      await tx.pointsLedger.create({
        data: { userId, delta: prize, reason: "ficha", ref: `flight:${flight.id}` },
      });
    }
    // decisión del dueño (2026-07-10): ENTRAR A JUGAR ya acredita al referidor,
    // aunque el vuelo termine en 0 (estrellarse también es jugar)
    await accreditIfPending(tx, userId);
    const used = await tx.flight.count({ where: { userId, day: dayKey() } });
    return { prize, remaining: Math.max(0, MAX_FLIGHTS_PER_DAY - used) };
  });
}
