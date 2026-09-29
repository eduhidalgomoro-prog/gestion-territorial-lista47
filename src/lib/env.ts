/**
 * Lectura centralizada de variables de entorno (solo servidor).
 * Se leen en cada llamada para que las pruebas puedan cambiarlas.
 */

export type DataBackend = "sheets" | "local" | "memory";

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

export const env = {
  dataBackend(): DataBackend {
    const v = read("DATA_BACKEND") || "local";
    if (v !== "sheets" && v !== "local" && v !== "memory") throw new Error(`DATA_BACKEND inválido: ${v}`);
    return v;
  },
  spreadsheetId: () => read("GOOGLE_SHEETS_SPREADSHEET_ID"),
  serviceAccountEmail: () => read("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  // En Vercel la clave suele pegarse con "\n" literales: se normalizan.
  serviceAccountKey: () => read("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  oauthClientId: () => read("GOOGLE_OAUTH_CLIENT_ID"),
  oauthClientSecret: () => read("GOOGLE_OAUTH_CLIENT_SECRET"),
  authSecret: () => read("AUTH_SECRET"),
  adminEmails: () =>
    read("ADMIN_EMAILS")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  devLogin: () => process.env.NODE_ENV === "development" && read("AUTH_DEV_LOGIN") === "true",
  appUrl: () => (read("APP_URL") || "http://localhost:3000").replace(/\/$/, ""),
  redisUrl: () => read("UPSTASH_REDIS_REST_URL") || read("KV_REST_API_URL"),
  redisToken: () => read("UPSTASH_REDIS_REST_TOKEN") || read("KV_REST_API_TOKEN"),
  timezone: () => read("APP_TIMEZONE") || "America/Argentina/Buenos_Aires",
};
