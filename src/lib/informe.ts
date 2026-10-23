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
  barriosDistintos: number;
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

  // «Corrientes» y «Corrientes Capital» son la misma.
  const ciudadDe = (c: string) => (!c ? "Sin dato" : /^corrientes( capital)?$/.test(normalizeText(c)) ? "Corrientes" : nombrePropio(c));
  const ciudades = frecuentes(quienes.map((p) => ciudadDe(p.ciudad)), 6, "Otras localidades");
  const conBarrio = quienes.filter((p) => p.barrio).map((p) => nombrePropio(p.barrio));
  const barrios = frecuentes(conBarrio, 8, "Otros barrios");

  const preguntas = parsePreguntas(a.preguntas_extra);
  const respuestas = activas.map((i) => respuestasPorPregunta(i.respuestas, preguntas));
  return {
    inscriptos: activas.length,
    enEspera: propias.filter((i) => i.estado === "EN ESPERA").length,
    edades,
    ciudades,
    barrios,
    barriosDistintos: new Set(conBarrio).size,
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


// ---------------------------------------------------------------------------
// «Lo principal»: frases cortas armadas con reglas fijas a partir de los mismos números del informe
// (no son interpretaciones: siempre coinciden con los gráficos).
// ---------------------------------------------------------------------------

export interface Conclusion {
  sobre: string; // la pregunta o el tema («Edades», «De dónde vienen»…)
  texto: string;
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

// Palabras que no dicen nada sobre el tema (para las respuestas abiertas). Sin tildes.
const VACIAS = new Set(
  ("para como poder tener hacer quiero quisiera gustaria llevar llevarme llevarte taller algo algun alguna mucho muchas muchos " +
    "sobre desde entre hasta cuando donde porque pero tambien solo cada todo todos todas otra otro otras otros este esta estos estas " +
    "esas esos tengo tiene nuevo nueva nuevos nuevas mejor mejorar saber sacar lograr ver mas muy bien area que con los las del una unos unas por mis sus").split(" "),
);

const raiz = (w: string) => (w.length > 5 && w.endsWith("es") ? w.slice(0, -2) : w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);

/** Los temas que más se repiten en las respuestas abiertas (cada respuesta cuenta una vez por palabra). Se muestran con sus tildes. */
export function temasFrecuentes(respuestas: string[], max = 4): string[] {
  const cuenta = new Map<string, { n: number; formas: Map<string, number> }>();
  for (const r of respuestas) {
    const vistas = new Set<string>();
    for (const original of r.toLowerCase().split(/[^a-záéíóúüñ]+/)) {
      const w = normalizeText(original);
      if (w.length < 4 || VACIAS.has(w)) continue;
      const k = raiz(w);
      if (VACIAS.has(k) || vistas.has(k)) continue;
      vistas.add(k);
      const c = cuenta.get(k) ?? { n: 0, formas: new Map() };
      c.n++;
      c.formas.set(original, (c.formas.get(original) ?? 0) + 1);
      cuenta.set(k, c);
    }
  }
  return [...cuenta.values()]
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => [...c.formas.entries()].sort((a, b) => b[1] - a[1])[0][0]);
}

const enumerar = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export function conclusiones(inf: Informe): Conclusion[] {
  const out: Conclusion[] = [];
  if (!inf.inscriptos) return out;

  for (const p of inf.preguntas) {
    if (p.respondieron < 3) continue;
    if (p.opciones) {
      const orden = [...p.opciones].filter((o) => o.label !== "Otra respuesta" && o.value).sort((a, b) => b.value - a.value);
      const [primera, segunda, tercera] = orden;
      if (!primera) continue;
      const sino = p.opciones.some((o) => normalizeText(o.label) === "si") && p.opciones.length <= 3;
      const v = (o: Conteo) => `${pct(o.value, p.respondieron)}%`;
      let texto: string;
      if (sino) texto = `El ${v(primera)} respondió «${primera.label}».`;
      else if (segunda && segunda.value === primera.value) texto = `Empatan «${primera.label}» y «${segunda.label}» (${v(primera)} cada una).`;
      else if (segunda && (!tercera || tercera.value < segunda.value)) texto = `Lo más elegido es «${primera.label}» (${v(primera)}), seguido de «${segunda.label}» (${v(segunda)}).`;
      else texto = `Lo más elegido es «${primera.label}» (${v(primera)}).`;
      out.push({ sobre: p.texto, texto });
    } else {
      const temas = temasFrecuentes(p.libres);
      if (temas.length >= 2) out.push({ sobre: p.texto, texto: `Lo que más se repite: ${enumerar(temas)}.` });
    }
  }

  const edades = inf.edades.filter((e) => e.label !== "Sin dato");
  const conEdad = edades.reduce((n, e) => n + e.value, 0);
  const mayor = [...edades].sort((a, b) => b.value - a.value)[0];
  if (mayor?.value && conEdad >= 3) {
    const rango = mayor.label === "60 o más" || mayor.label === "Hasta 17" ? mayor.label.toLowerCase() : `de ${mayor.label}`;
    out.push({ sobre: "Edades", texto: `El grupo más grande es ${rango} años (${pct(mayor.value, conEdad)}%).` });
  }

  const [ciudad, ...otras] = inf.ciudades.filter((c) => c.label !== "Sin dato");
  if (ciudad) {
    const texto = !otras.length
      ? `Todo el público es de ${ciudad.label}${inf.barriosDistintos > 1 ? `, de ${inf.barriosDistintos} barrios distintos` : ""}.`
      : `El ${pct(ciudad.value, inf.inscriptos)}% es de ${ciudad.label}; el resto viene de ${otras.length === 1 ? otras[0].label : `${otras.length} localidades más`}.`;
    out.push({ sobre: "De dónde vienen", texto });
  }

  if (inf.enEspera > 0) out.push({ sobre: "Lista de espera", texto: `Hay ${inf.enEspera} ${inf.enEspera === 1 ? "persona" : "personas"} esperando un lugar: el interés supera el cupo.` });
  return out;
}