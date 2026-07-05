/* Cliente HTTP de la API de BARDOOO. El token de Privy se inyecta por request
   (getAccessToken lo renueva solo). Los errores de negocio del server vienen
   como {error, message} — message ya está listo para el toast.               */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export class ApiFail extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch(path, { method = "GET", body, token, nameHint } = {}) {
  const headers = {};
  // content-type SOLO si hay body: mandarlo con body vacío hace que Fastify
  // intente parsear JSON de la nada y reviente (bug real de producción)
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (nameHint) headers["x-name-hint"] = encodeURIComponent(nameHint).slice(0, 120);

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFail(0, "NETWORK", "No pudimos hablar con el server. ¿Está corriendo la API?");
  }

  let data = null;
  try { data = await res.json(); } catch {}

  if (!res.ok) {
    throw new ApiFail(res.status, data?.error ?? "UNKNOWN", data?.message ?? "Algo salió mal");
  }
  return data;
}
