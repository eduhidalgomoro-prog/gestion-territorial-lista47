import type { BadgeColor } from "@/components/ui";
import { ZONAS, ZONAS_ACTIVIDAD, type EstadoActividad, type EstadoFlyer } from "./schema";
import { ambitoDe, esZonaCapital, nombrePropio, regionLabel } from "./territorio";

export const ESTADO_COLOR: Record<EstadoActividad, BadgeColor> = {
  BORRADOR: "gris",
  PROGRAMADA: "azul",
  CONFIRMADA: "verde",
  REALIZADA: "petroleo",
  SUSPENDIDA: "naranja",
  CANCELADA: "rojo",
};

/** Colores de los puntos del mapa y del calendario (hex). */
export const ESTADO_HEX: Record<EstadoActividad, string> = {
  BORRADOR: "#8a94a3",
  PROGRAMADA: "#2b64c5",
  CONFIRMADA: "#3f8f2c",
  REALIZADA: "#106985",
  SUSPENDIDA: "#c77a0a",
  CANCELADA: "#b3261e",
};

export const ZONA_HEX: Record<string, string> = {
  NORTE: "#106985",
  ESTE: "#3f8f2c",
  SUR: "#7a4fb0",
  GENERAL: "#6b7280",
};

export const FLYER_COLOR: Record<EstadoFlyer, BadgeColor> = {
  SOLICITADO: "gris",
  "EN DISEÑO": "azul",
  "PARA APROBACIÓN": "naranja",
  APROBADO: "verde",
  PUBLICADO: "petroleo",
};

export const zonaLabel = (z: string) =>
  z === "GENERAL" ? "General (toda la ciudad)" : !z ? "Sin zona" : esZonaCapital(z) ? `Zona ${z.charAt(0)}${z.slice(1).toLowerCase()}` : regionLabel(z);

/** Opciones de un desplegable de zona: las de Capital y después las regiones del interior. */
export function opcionesZona(regiones: string[], { general = true, capital = true }: { general?: boolean; capital?: boolean } = {}) {
  const cap = capital ? (general ? ZONAS_ACTIVIDAD : ZONAS).map((z) => [z, zonaLabel(z)] as const) : [];
  return [...cap, ...[...new Set(regiones)].sort().map((r) => [r, regionLabel(r)] as const)];
}

/** Dónde es, en pocas palabras: la zona en Capital; la localidad y la región en el interior. */
export const ubicacionLabel = (a: { zona: string; localidad: string }) =>
  ambitoDe(a.zona) === "interior" ? [a.localidad && nombrePropio(a.localidad), zonaLabel(a.zona)].filter(Boolean).join(" · ") : zonaLabel(a.zona);

export const titulo = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);
