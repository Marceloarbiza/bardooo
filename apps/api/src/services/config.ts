import { prisma } from "../db";

/*  Perillas de plataforma (anti-bots, decisión del dueño 2026-07-09):
    TODO configurable, nada grabado en piedra. El lanzamiento va ABIERTO
    (garantía 0, cupo 0 = sin límite) para buscar masividad; las perillas se
    prenden con `pnpm admin config set <perilla> <valor>` cuando los datos lo
    pidan — al instante, sin redeploy. El FUSIBLE del relayer es la excepción:
    siempre tiene un valor (es la red final contra cualquier ataque).         */

let cache: { at: number; cfg: PlatformKnobs } | null = null;
const TTL_MS = 15_000; // los cambios de perilla tardan como mucho 15 s en regir

export interface PlatformKnobs {
  bondPts: number;
  createsPerDay: number;
  relayBudgetMilli: number; // miliPOL de gasto del relayer por hora
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
  };
  cache = { at: Date.now(), cfg };
  return cfg;
}

export async function setKnob(key: keyof PlatformKnobs, value: number) {
  await prisma.platformConfig.upsert({
    where: { id: 1 },
    create: { id: 1, [key]: value },
    update: { [key]: value },
  });
  cache = null;
}
