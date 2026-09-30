import { CATEGORIAS } from "./categorias";
import type { ConfigRow } from "./schema";

/**
 * Listas y textos editables desde Configuración (hoja CONFIG). Cada lista se guarda como una línea por opción;
 * los mensajes se guardan tal cual (pueden tener varias líneas).
 * Los valores por defecto salen del formulario de Google que se usaba hasta ahora.
 */
export interface AppConfig {
  objetivo_mensual: number;
  tipos_actividad: string[];
  publicos: string[];
  tipos_articulacion: string[];
  mesas: string[];
  tipos_insumo: string[];
  lugares: string[];
  emojis_mapa: string[];
  mensaje_confirmacion: string;
  mensaje_grupo: string;
}

/** Comodines que se reemplazan en los mensajes de WhatsApp. */
export const COMODINES_MENSAJE = "{nombre} · {actividad} · {cuando} (día y hora) · {fecha} · {hora} · {lugar} · {link_grupo}";

export const DEFAULT_CONFIG: AppConfig = {
  objetivo_mensual: 2,
  tipos_actividad: [
    "ESME", "FERIAS DE ESME", "MARCANDO HUELLAS", "JUNTO A VOS", "MESA DE DEPORTES", "OPERATIVO DE SALUD", "TALLER", "CAPACITACIÓN", "OTRO",
  ],
  publicos: ["FAMILIAS EN GENERAL", "MUJERES", "EMPRENDEDORES", "JÓVENES", "DEPORTISTAS", "ADULTOS MAYORES", "NIÑOS Y NIÑAS"],
  tipos_articulacion: ["MESA INTERNA", "INSTITUCIÓN EXTERNA", "ORGANIZACIÓN BARRIAL", "CLUB", "ESCUELA", "IGLESIA / CAPILLA", "OTRO"],
  mesas: ["ESME EN LOS BARRIOS", "FERIAS DE ESME", "MARCANDO HUELLAS", "MESA DE DEPORTES"],
  tipos_insumo: ["MATERIALES", "ALIMENTOS", "IMPRESIÓN", "TRANSPORTE", "PREMIOS", "EQUIPAMIENTO", "OTRO"],
  lugares: ["Casa partidaria", "Sede del partido", "Casa de vecino/a", "Plaza o parque", "Cancha", "Salón", "Club", "Capilla", "Escuela"],
  emojis_mapa: CATEGORIAS.map((c) => `${c.label} = ${c.emoji}`),
  mensaje_confirmacion: "Hola {nombre} 👋 Te escribimos por *{actividad}*, al que te inscribiste: {cuando}, en {lugar}.\n¿Nos confirmás si vas a venir? 🙌",
  mensaje_grupo: "¡Gracias por confirmar, {nombre}! 🙌 Sumate al grupo de *{actividad}* para recibir las novedades:\n{link_grupo}",
};

export const CONFIG_LABELS: Record<keyof AppConfig, { titulo: string; descripcion: string }> = {
  objetivo_mensual: { titulo: "Objetivo mensual por zona", descripcion: "Cantidad mínima de actividades que se pide a cada zona por mes (indicador, no bloquea)." },
  tipos_actividad: { titulo: "Tipos / programas de actividad", descripcion: "Una opción por línea." },
  publicos: { titulo: "Público dirigido", descripcion: "Una opción por línea." },
  tipos_articulacion: { titulo: "Tipos de articulación", descripcion: "Una opción por línea." },
  mesas: { titulo: "Mesas internas", descripcion: "Mesas con las que se puede articular. Una por línea." },
  tipos_insumo: { titulo: "Tipos de insumo", descripcion: "Para «otros insumos» de logística. Una por línea." },
  lugares: { titulo: "Lugares frecuentes", descripcion: "Sugerencias para «Lugar específico». Una por línea." },
  emojis_mapa: {
    titulo: "Emojis del mapa",
    descripcion: "Un emoji por categoría (Deportes, Talleres, Salud, Mascotas, Ferias, Capacitaciones, Comunidad, Otras). Formato: Categoría = emoji.",
  },
  mensaje_confirmacion: {
    titulo: "Mensaje para pedir confirmación (WhatsApp)",
    descripcion: `Lo que se envía a cada inscripta al tocar «Pedir confirmación». Podés usar: ${COMODINES_MENSAJE}. *texto* sale en negrita.`,
  },
  mensaje_grupo: {
    titulo: "Mensaje de invitación al grupo (WhatsApp)",
    descripcion: `Lo que se envía al tocar «Invitar al grupo». Incluí {link_grupo}. Podés usar: ${COMODINES_MENSAJE}.`,
  },
};

export const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as (keyof AppConfig)[];
/** Claves que son un texto libre (no una lista). */
export const CONFIG_TEXTOS: (keyof AppConfig)[] = ["mensaje_confirmacion", "mensaje_grupo"];

export function parseConfig(rows: ConfigRow[]): AppConfig {
  const cfg: AppConfig = structuredClone(DEFAULT_CONFIG);
  const map = new Map(rows.map((r) => [String(r.clave).trim(), String(r.valor ?? "")]));
  const obj = Number(map.get("objetivo_mensual"));
  if (Number.isInteger(obj) && obj >= 0 && obj <= 50) cfg.objetivo_mensual = obj;
  for (const k of CONFIG_KEYS) {
    if (k === "objetivo_mensual") continue;
    const v = map.get(k);
    if (v === undefined) continue;
    if (CONFIG_TEXTOS.includes(k)) {
      if (v.trim()) (cfg[k] as string) = v.replace(/\r\n/g, "\n").trim();
      continue;
    }
    const list = v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (list.length) (cfg[k] as string[]) = list;
  }
  return cfg;
}

export function configToValue(k: keyof AppConfig, v: AppConfig[keyof AppConfig]): string {
  return Array.isArray(v) ? v.join("\n") : String(v);
}
