import { prisma, type Tx } from "../db";
import { errors } from "../errors";

/*  Referidos (PLAN.md): +25 al referidor SOLO cuando el referido completa
    primer login + una acción real (un vuelo con premio o una apuesta).
    Anti-sybil básico: un usuario puede ser referido UNA sola vez (unique en DB),
    nadie se refiere a sí mismo, y el alta solo registra PENDIENTE.            */

export const REFERRAL_PRIZE = 25;

/** Registra el vínculo (pendiente) al entrar con /i/{codigo}. Idempotente-ish:
 *  si ya fue referido alguna vez, no hace nada. */
export async function useReferralCode(userId: string, code: string) {
  const referrer = await prisma.user.findUnique({ where: { refCode: code.trim() } });
  if (!referrer || referrer.id === userId) throw errors.badReferral();

  const existing = await prisma.referral.findUnique({ where: { referredId: userId } });
  if (existing) return { registered: false }; // ya era referido de alguien: no se pisa

  await prisma.referral.create({
    data: { code: code.trim(), referrerId: referrer.id, referredId: userId },
  });
  return { registered: true };
}

/** Acredita el premio al referidor si este usuario tenía un referral pendiente.
 *  Se llama desde la PRIMERA acción real (placeBet / endFlight con premio),
 *  dentro de la misma transacción.                                            */
export async function accreditIfPending(tx: Tx, referredUserId: string) {
  const pending = await tx.referral.findUnique({ where: { referredId: referredUserId } });
  if (!pending || pending.accredited) return;
  await tx.referral.update({ where: { id: pending.id }, data: { accredited: true } });
  await tx.user.update({
    where: { id: pending.referrerId },
    data: { points: { increment: REFERRAL_PRIZE } },
  });
  await tx.pointsLedger.create({
    data: {
      userId: pending.referrerId,
      delta: REFERRAL_PRIZE,
      reason: "referido",
      ref: `referral:${pending.id}`,
    },
  });
}
