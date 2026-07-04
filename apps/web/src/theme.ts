/* Paleta C y constantes de plataforma del prototipo.
   PLATFORM_BPS NO se hardcodea en la app real: se lee de factory.platformFeeBps()
   (fase 3). Acá vive solo para el mock.                                        */

export const C = {
  bg: "#0C0616", bg2: "#150B29", bg3: "#1E1038", line: "#2C1A52",
  text: "#F6F1FF", dim: "#A18BD0", faint: "#635089",
  si: "#00F0C0", siDeep: "#04382E", siGlow: "rgba(0,240,192,.35)",
  no: "#FF2E7C", noDeep: "#4A0E2A", noGlow: "rgba(255,46,124,.32)",
  gold: "#FFC53D", goldDeep: "#4A3506",
} as const;

export const PLATFORM_BPS = 300;      // en la app real: factory.platformFeeBps()
export const FLASH_REBATE_BPS = 200;  // en relampagos BARDOOO cobra solo 1%: cede 2pp al creador (total al apostador: igual)
export const MAX_CREATOR_BPS = 1000;  // techo 10%
export const CLOSE_OFFSET_MIN = 5;    // las apuestas cierran 5 min antes del evento
