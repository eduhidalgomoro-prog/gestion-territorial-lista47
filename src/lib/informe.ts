import { normalizeText } from "./format";
import { parsePreguntas, type Pregunta } from "./preguntas";
import type { Actividad, Inscripcion, Participante } from "./schema";

/**
 * Informe del público de una actividad: quiénes se inscribieron y qué respondieron a las preguntas del formulario.
 * Solo números y respuestas sin nombre (sirve para mostrárselo al disertante).
 */

export interface Conteo {
  label: string;
  value: number;
}

export interface InformePregunta {
  texto: string;
  respondieron: number;
  opciones: Conteo[] | null; // preguntas con opciones: cuántas eligieron cada una (en el orden del formulario)
  libres: string[]; // preguntas abiertas: las respuestas, sin nombre
}

export interface Informe {
  inscriptos: number;
  enEspera: number;
  edades: Conteo[];
  ciudades: Conteo[];
  barrios: Conteo[];
  preguntas: InformePregunta[];
}

/** Separa el texto guardado («Pregunta: respuesta», una por línea) en respuestas por pregunta. */
export function respuestasPorPregunta(texto: string, preguntas: Pregunta[]): Map<string, string> {
  const out = new Map<string, string>();
  let actual = "";
  for (const linea of (texto ?? "").split(/\r?\n/)) {
    const p = preguntas.find((q) => linea.startsWith(`${q.texto}:`));
    if (p) {
      actual = p.texto;
      out.set(actual, linea.slice(p.texto.length + 1).trim());
    } else if (actual && linea.trim()) {
      out.set(actual, `${out.get(actual)}\n${linea.trim()}`); // respuesta de varias líneas
    }
  }
  return out;
}

const RANGOS: [string, number, number][] = [
  ["Hasta 17", 0, 17],
  ["18 a 29", 18, 29],
  ["30 a 44", 30, 44],
  ["45 a 59", 45, 59],
  ["60 o más", 60, 200],
];

function edad(nacimiento: string, al: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nacimiento ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let e = al.getFullYear() - y;
  if (al.getMonth() + 1 < mo || (al.getMonth() + 1 === mo && al.getDate() < d)) e--;
  return e >= 0 && e < 120 ? e : null;
}

/** Los más frecuentes primero; el resto junto en «Otros». */
function frecuentes(valores: string[], max: number, otros = "Otros"): Conteo[] {
  const c = new Map<string, number>();
  for (const v of valores) c.set(v, (c.get(v) ?? 0) + 1);
  const orden = [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));
  if (orden.length <= max) return orden;
  const resto = orden.slice(max - 1).reduce((n, x) => n + x.value, 0);
  return [...orden.slice(0, max - 1), { label: otros, value: resto }];
}

const nombrePropio = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());

export function armarInforme(a: Actividad, inscripciones: Inscripcion[], participantes: Participante[]): Informe {
  const propias = inscripciones.filter((i) => i.actividad_id === a.id);
  const activas = propias.filter((i) => i.estado === "INSCRIPTO");
  const personas = new Map(participantes.map((p) => [p.id, p]));
  const quienes = activas.map((i) => personas.get(i.participante_id)).filter((p): p is Participante => !!p);
  const al = new Date(); // edad a hoy

  const edades = RANGOS.map(([label]) => ({ label, value: 0 }));
  let sinEdad = 0;
  for (const p of quienes) {
    const e = edad(p.fecha_nacimiento, al);
    const i = e === null ? -1 : RANGOS.findIndex(([, d, h]) => e >= d && e <= h);
    if (i < 0) sinEdad++;
    else edades[i].value++;
  }
  if (sinEdad) edades.push({ label: "Sin dato", value: sinEdad });

  const ciudades = frecuentes(quienes.map((p) => (p.ciudad ? nombrePropio(p.ciudad) : "Sin dato")), 6, "Otras localidades");
  const barrios = frecuentes(quienes.filter((p) => p.barrio).map((p) => nombrePropio(p.barrio)), 8, "Otros barrios");

  const preguntas = parsePreguntas(a.preguntas_extra);
  const respuestas = activas.map((i) => respuestasPorPregunta(i.respuestas, preguntas));
  return {
    inscriptos: activas.length,
    enEspera: propias.filter((i) => i.estado === "EN ESPERA").length,
    edades,
    ciudades,
    barrios,
    preguntas: preguntas.map((q) => {
      const dadas = respuestas.map((r) => r.get(q.texto) ?? "").filter(Boolean);
      if (!q.opciones) return { texto: q.texto, respondieron: dadas.length, opciones: null, libres: dadas };
      const conteo = q.opciones.map((label) => ({ label, value: 0 }));
      let otra = 0;
      for (const d of dadas) {
        const i = q.opciones.findIndex((o) => normalizeText(o) === normalizeText(d));
        if (i >= 0) conteo[i].value++;
        else otra++;
      }
      if (otra) conteo.push({ label: "Otra respuesta", value: otra });
      return { texto: q.texto, respondieron: dadas.length, opciones: conteo, libres: [] };
    }),
  };
}
