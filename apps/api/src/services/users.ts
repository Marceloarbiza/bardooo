import { prisma } from "../db";

const WELCOME_POINTS = 60; // "¡Adentro! Tenés 60 pts para empezar"

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  return s || "jugador";
}

/** Alta / login: busca por privyId; si no existe lo crea con handle único
 *  (sufijo numérico si choca) y los puntos de bienvenida via ledger. */
export async function getOrCreateUser(privyId: string, nameHint?: string) {
  const existing = await prisma.user.findUnique({ where: { privyId } });
  if (existing) return existing;

  const name = (nameHint || "").trim().slice(0, 20) || "vos";
  const base = slugify(name);

  // reintenta con sufijo si el handle choca (colisión validada en DB, no en memoria)
  for (let i = 0; i < 50; i++) {
    const handle = "@" + (i === 0 ? base : `${base}${i + 1}`);
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { privyId, name, handle, points: WELCOME_POINTS } });
        await tx.pointsLedger.create({
          data: { userId: user.id, delta: WELCOME_POINTS, reason: "bienvenida" },
        });
        return user;
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        // si chocó el privyId (doble request del mismo login), devolvé el existente
        const again = await prisma.user.findUnique({ where: { privyId } });
        if (again) return again;
        continue; // chocó el handle: probar siguiente sufijo
      }
      throw e;
    }
  }
  throw new Error("No se pudo generar un handle único");
}

/** El nombre se puede editar; el handle es INMUTABLE (CLAUDE.md). */
export async function updateName(userId: string, name: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { name: name.trim().slice(0, 20) },
  });
}

export function serializeUser(u: {
  id: string; name: string; handle: string; walletAddr: string | null;
  points: number; refCode: string;
}) {
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    walletAddr: u.walletAddr,
    points: u.points,
    refCode: u.refCode,
  };
}
