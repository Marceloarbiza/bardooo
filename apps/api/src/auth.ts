import { PrivyClient } from "@privy-io/server-auth";
import { errors } from "./errors";

/*  Verificación del token de Privy SERVER-SIDE en cada request (PLAN.md).
    El front manda `Authorization: Bearer <accessToken de Privy>`. Acá se
    verifica la firma y sale el privyId (DID). El alta de usuario la hace
    getOrCreateUser con ese privyId.                                         */

export interface AuthResult {
  privyId: string;
  nameHint?: string;
}

export type TokenVerifier = (authorization: string | undefined) => Promise<AuthResult>;

export function makePrivyVerifier(appId: string, appSecret: string): TokenVerifier {
  const privy = new PrivyClient(appId, appSecret);
  return async (authorization) => {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token) throw errors.unauthorized();
    try {
      const claims = await privy.verifyAuthToken(token);
      return { privyId: claims.userId };
    } catch {
      throw errors.unauthorized();
    }
  };
}
