import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Link del informe para el disertante (sin usuario): /informe/<id>?k=<firma>.
 * La firma solo sirve para esa actividad y no se puede adivinar. Muestra cantidades y respuestas sin nombre.
 */
export const firmaInforme = (actividadId: string) => createHmac("sha256", env.authSecret()).update(`informe:${actividadId}`).digest("base64url").slice(0, 24);

export function firmaValida(actividadId: string, k: string): boolean {
  const esperada = Buffer.from(firmaInforme(actividadId));
  const dada = Buffer.from(k ?? "");
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}

export const linkInforme = (actividadId: string) => `${env.appUrl()}/informe/${actividadId}?k=${firmaInforme(actividadId)}`;
