import { normalizeText } from "./format";
import type { Actividad } from "./schema";

/**
 * Guía para organizar el OPERATIVO DE SALUD VISUAL (la que arma la coordinación, en public/guias).
 * En la app se usa como checklist de la ficha, para precargar lo que se le pide a Logística
 * y para dar un número de orden de llegada en la recepción.
 * Las entregas de anteojos tienen el mismo tipo de actividad, pero no usan esta guía.
 */

/**
 * Link al PDF. La «v» cambia cada vez que se regenera la guía (npm run guia:visual):
 * así ningún celular ni navegador sigue mostrando la versión anterior que tenía guardada.
 */
export const GUIA_VISUAL_VERSION = "2026-10-10";
export const GUIA_VISUAL_PDF = `/guias/operativo-salud-visual.pdf?v=${GUIA_VISUAL_VERSION}`;

export function esOperativoVisual(a: Pick<Actividad, "tipo" | "nombre">): boolean {
  const nombre = normalizeText(a.nombre);
  return normalizeText(a.tipo) === "operativo de salud" && /visual/.test(nombre) && !/entrega/.test(nombre);
}

export interface ItemGuia {
  id: string;
  texto: string;
  detalle?: string;
}

export const CHECKLIST_VISUAL: { grupo: string; items: ItemGuia[] }[] = [
  {
    grupo: "El lugar",
    items: [
      { id: "espacios", texto: "Tres espacios separados", detalle: "Recepción, control visual y óptica, con cierta distancia entre sí." },
      { id: "control", texto: "Control visual: bien iluminado y tranquilo", detalle: "Con privacidad, sin ruidos ni interrupciones." },
      { id: "enchufe", texto: "Tomacorriente cerca del control visual" },
      { id: "espera", texto: "Lugar cómodo para la espera, con sillas" },
      { id: "sanitario", texto: "Sanitario disponible, limpio y con elementos básicos" },
    ],
  },
  {
    grupo: "Recepción",
    items: [
      { id: "referente", texto: "Referente local para recibir a los vecinos" },
      { id: "carga", texto: "Celular o computadora para cargar a cada persona", detalle: "En la asistencia, cada presente recibe su número de llegada." },
      { id: "talonario", texto: "Talonario de números (orden de llegada)" },
    ],
  },
  {
    grupo: "Mobiliario y atención",
    items: [
      { id: "mobiliario", texto: "Mesas y sillas pedidas a Logística", detalle: "Una mesa por espacio: recepción, control (2 sillas) y armazones (3 sillas)." },
      { id: "agua", texto: "Agua o jugo para quienes esperan" },
    ],
  },
];

export const IDS_CHECKLIST_VISUAL = CHECKLIST_VISUAL.flatMap((g) => g.items.map((i) => i.id));

/** Lo que se le pide a Logística al crear un operativo visual (se puede ajustar). */
export const LOGISTICA_VISUAL = {
  mesas_cant: 3, // recepción, control visual y armazones
  sillas_cant: 17, // 2 recepción + 2 control + 3 óptica + 10 para la espera
};

/** Ítems tildados (se guardan separados por coma en la columna «Checklist»). */
export const itemsHechos = (valor: string): string[] => valor.split(",").map((x) => x.trim()).filter((x) => IDS_CHECKLIST_VISUAL.includes(x));

export function progresoChecklist(a: Pick<Actividad, "checklist">) {
  const hechos = itemsHechos(a.checklist ?? "").length;
  return { hechos, total: IDS_CHECKLIST_VISUAL.length, completo: hechos === IDS_CHECKLIST_VISUAL.length };
}
