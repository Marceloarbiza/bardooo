import { prisma } from "../db";
import { MAX_TOTAL_BPS } from "../settlement";

/*  Perillas de plataforma: TODO configurable, nada grabado en piedra.
    - anti-bots (2026-07-09): bondPts / createsPerDay / relayBudgetMilli.
    - comisiones (2026-07-10): los 4 bps son perillas (el usuario no las elige,
      el dueño sí — dial de crecimiento; ej. plataforma 0% para el lanzamiento).
      Cada duelo CONGELA sus bps al nacer: cambiar la perilla NO toca pozos
      abiertos (misma semántica que la factory on-chain).
    Se cambian con `pnpm admin config set <perilla> <valor>` y rigen en ≤15 s
    sin redeploy. El FUSIBLE del relayer siempre tiene un valor.               */

let cache: { at: number; cfg: PlatformKnobs } | null = null;
const TTL_MS = 15_000; // los cambios de perilla tardan como mucho 15 s en regir

export interface PlatformKnobs {
  bondPts: number;
  createsPerDay: number;
  relayBudgetMilli: number; // miliPOL de gasto del relayer por hora
  platformBps: number; // duelo común: share de plataforma
  creatorBps: number; // duelo común: share del creador
  flashPlatformBps: number; // relámpago: share de plataforma
  flashCreatorBps: number; // relámpago: share del creador
}

export async function getKnobs(): Promise<PlatformKnobs> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const row = await prisma.platformConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  const cfg = {
    bondPts: row.bondPts,
    createsPerDay: row.createsPerDay,
    relayBudgetMilli: row.relayBudgetMilli,
    platformBps: row.platformBps,
    creatorBps: row.creatorBps,
    flashPlatformBps: row.flashPlatformBps,
    flashCreatorBps: row.flashCreatorBps,
  };
  cache = { at: Date.now(), cfg };
  return cfg;
}

const FEE_KEYS = ["platformBps", "creatorBps", "flashPlatformBps", "flashCreatorBps"] as const;

/** Setea una o varias perillas EN UN SOLO paso (las comisiones suelen moverse
 *  de a pares: bajar plataforma y subir creador no tiene estado intermedio
 *  válido, así que la validación corre sobre el estado FINAL). */
export async function setKnobs(patch: Partial<PlatformKnobs>) {
  const touchesFees = FEE_KEYS.some((k) => patch[k] !== undefined);
  if (touchesFees) {
    // MISMAS invariantes que la factory on-chain: total normal == total flash
    // (FeeTotalsMismatch) y techo 20% (FeeTooHigh) — paridad pts/usdc.
    const cur = await getKnobs();
    const next = { ...cur, ...patch };
    const normal = next.platformBps + next.creatorBps;
    const flash = next.flashPlatformBps + next.flashCreatorBps;
    if (normal !== flash)
      throw new Error(
        `El total normal (${normal} bps) tiene que ser igual al total flash (${flash} bps) — ` +
          `el apostador paga lo mismo en los dos modos. Seteá las perillas juntas, ej: ` +
          `config set platformBps 0 creatorBps 1000 flashPlatformBps 0 flashCreatorBps 1000`
      );
    if (normal > MAX_TOTAL_BPS)
      throw new Error(`El total no puede superar ${MAX_TOTAL_BPS} bps (20%)`);
  }
  await prisma.platformConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...patch },
    update: { ...patch },
  });
  cache = null;
}

export async function setKnob(key: keyof PlatformKnobs, value: number) {
  await setKnobs({ [key]: value });
}

/** Solo para tests: fuerza a releer las perillas de la DB. */
export function clearKnobsCache() {
  cache = null;
}
