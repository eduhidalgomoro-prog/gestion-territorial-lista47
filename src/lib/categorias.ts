import { normalizeText } from "./format";

/**
 * Categorías visuales de las actividades (un emoji por categoría para el mapa, las tarjetas y el calendario).
 * La categoría sale del TIPO de actividad; si el tipo no alcanza, de palabras del nombre.
 * Los emojis se pueden cambiar desde Configuración → Listas.
 */

export const CATEGORIAS = [
  { id: "DEPORTES", label: "Deportes", emoji: "⚽" },
  { id: "TALLERES", label: "Talleres", emoji: "🎨" },
  { id: "SALUD", label: "Salud", emoji: "🩺" },
  { id: "MASCOTAS", label: "Mascotas", emoji: "🐾" },
  { id: "FERIAS", label: "Ferias", emoji: "🛍️" },
  { id: "CAPACITACIONES", label: "Capacitaciones", emoji: "📚" },
  { id: "COMUNIDAD", label: "Comunidad", emoji: "🤝" },
  { id: "OTRAS", label: "Otras", emoji: "📍" },
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]["id"];

// El orden importa: gana la primera regla que coincide.
const REGLAS: [CategoriaId, RegExp][] = [
  ["MASCOTAS", /marcando ?huellas|mascota|veterinari|desparasit|perro|gato|castraci/],
  ["DEPORTES", /deporte|torneo|basquet|3x3|futbol|voley|clinica deportiva|semillero|campeones|atletismo|carrera/],
  ["SALUD", /salud|anteojo|visual|oftalm|vacunacion(?! de mascotas)|medic|odontolog|control/],
  ["FERIAS", /feria/],
  ["CAPACITACIONES", /capacitaci|finanzas|clases de apoyo|charla|curso|formacion/],
  ["COMUNIDAD", /junto a vos|comunit|reunion vecinal|operativo barrial/],
  ["TALLERES", /esme|taller|costura|crochet|fieltro|barberi|peluquer|peinado|catering|dona|pascualina|acordeon|folclore|chamame|vela|aroma|borla|recicl|atelier|manualidad|cocina|box matero/],
];

/** Tipos demasiado generales: para estos manda el nombre de la actividad (ej. «Clases de apoyo» con tipo Taller). */
const TIPOS_GENERICOS = new Set(["", "otro", "taller"]);

function porReglas(texto: string): CategoriaId | null {
  for (const [id, re] of REGLAS) if (re.test(texto)) return id;
  return null;
}

export function categoriaDe(a: { tipo: string; nombre: string }): CategoriaId {
  const tipo = normalizeText(a.tipo);
  const nombre = normalizeText(a.nombre);
  if (TIPOS_GENERICOS.has(tipo)) return porReglas(nombre) ?? porReglas(tipo) ?? "OTRAS";
  // El tipo lo elige quien carga la actividad: tiene prioridad sobre el nombre.
  return porReglas(tipo) ?? porReglas(nombre) ?? "OTRAS";
}

/** Emojis configurados (texto "DEPORTES=⚽" por línea) sobre los valores por defecto. */
export function emojisDe(config: string[] | undefined): Record<CategoriaId, string> {
  const out = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.emoji])) as Record<CategoriaId, string>;
  for (const linea of config ?? []) {
    const [k, v] = linea.split("=").map((s) => s.trim());
    const id = CATEGORIAS.find((c) => c.id === normalizeText(k ?? "").toUpperCase() || normalizeText(c.label) === normalizeText(k ?? ""))?.id;
    if (id && v) out[id] = v;
  }
  return out;
}

export function labelCategoria(id: CategoriaId): string {
  return CATEGORIAS.find((c) => c.id === id)?.label ?? id;
}
