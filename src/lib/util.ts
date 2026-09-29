import { randomBytes } from "node:crypto";

export * from "./format";

// ---------------------------------------------------------------------------
// IDs aleatorios: prefijo legible + 8 caracteres (ej. INS-7K3M9QX2)
// Actividades y participantes usan IDs correlativos (ver db.nextSeq).
// ---------------------------------------------------------------------------
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newId(prefix: string): string {
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % 32];
  return `${prefix}-${s}`;
}