/* Errores de negocio con status HTTP y mensaje para el usuario (rioplatense).
   El front muestra `message` tal cual en el toast.                            */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export const errors = {
  needsWallet: () => new ApiError(400, "NEEDS_WALLET", "Este duelo se juega con USDC: activá tu wallet"),
  usdcSoon: () => new ApiError(400, "USDC_SOON", "Los duelos de USDC llegan pronto: por ahora se juega con puntos"),
  notFound: () => new ApiError(404, "NOT_FOUND", "No encontramos esa apuesta. Revisá el link"),
  needsCode: () => new ApiError(403, "NEEDS_CODE", "Esta apuesta pide código de acceso"),
  wrongCode: () => new ApiError(403, "WRONG_CODE", "Código incorrecto"),
  otherSide: (otherLabel: string) =>
    new ApiError(409, "ALREADY_ON_OTHER_SIDE", `Ya estás del lado del ${otherLabel} en esta apuesta`),
  noPoints: () => new ApiError(400, "INSUFFICIENT_POINTS", "No te alcanzan los puntos"),
  wrongAmount: (amt: string) => new ApiError(400, "WRONG_AMOUNT", `En esta apuesta el monto es ${amt}`),
  belowMin: (min: string) => new ApiError(400, "BELOW_MIN", `Mínimo ${min}`),
  overCap: (cap: string) => new ApiError(400, "OVER_CAP", `Tope por persona: ${cap}`),
  betClosed: () => new ApiError(409, "BETTING_CLOSED", "Las apuestas ya cerraron"),
  betFull: () => new ApiError(409, "BET_FULL", "La apuesta está llena"),
  badState: () => new ApiError(409, "BAD_STATE", "La apuesta no está en un estado válido para eso"),
  notCreator: () => new ApiError(403, "NOT_CREATOR", "Solo el creador puede cargar el resultado"),
  tooEarly: () => new ApiError(409, "TOO_EARLY", "Todavía no se puede resolver: esperá al cierre"),
  nothingToClaim: () => new ApiError(409, "NOTHING_TO_CLAIM", "No tenés premio en esta apuesta"),
  alreadySettled: () => new ApiError(409, "ALREADY_SETTLED", "Ya cobraste en esta apuesta"),
  noFlights: () => new ApiError(429, "NO_FLIGHTS", "Sin vuelos por hoy. Mañana hay más"),
  badScore: () => new ApiError(400, "BAD_SCORE", "Ese puntaje no es válido"),
  flightTooFast: () => new ApiError(400, "FLIGHT_TOO_FAST", "Ese vuelo fue demasiado rápido para ser real"),
  badReferral: () => new ApiError(400, "BAD_REFERRAL", "Ese código de invitación no sirve"),
  unauthorized: () => new ApiError(401, "UNAUTHORIZED", "Iniciá sesión para hacer eso"),
  chainOnly: () => new ApiError(400, "CHAIN_ONLY", "Este duelo vive en la cadena: se juega desde tu wallet"),
  creatorCannotBet: () => new ApiError(409, "CREATOR_CANNOT_BET", "Sos el juez de este duelo: no podés apostar en tu propio pozo"),
  walletTaken: () => new ApiError(409, "WALLET_TAKEN", "Esa wallet ya está vinculada a otra cuenta"),
  badSignature: () => new ApiError(400, "BAD_SIGNATURE", "La firma no es válida"),
};
