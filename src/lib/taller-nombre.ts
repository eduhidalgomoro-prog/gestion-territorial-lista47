import { normalizeText } from "./format";

/**
 * Cómo se MUESTRA el nombre de un taller en pantallas operativas (no cambia lo guardado).
 * «Taller De Barbería, Consiste En Cuatro Clases (Viernes 2,9,16 Y 23 De Octubre)» → «Taller de Barbería».
 */
export function nombreCorto(nombre: string): string {
  let s = (nombre ?? "").trim().replace(/\s+/g, " ");
  const corte = s.search(/\s*[(,]/);
  if (corte >= 8) s = s.slice(0, corte);
  s = s.replace(/[\s.:;,-]+$/, "");
  // Conectores en minúscula cuando el nombre viene con Todas Las Iniciales En Mayúscula.
  return s.replace(/(?<=\s)(De|Del|La|Las|Los|El|Y|E|En|Con|Para|Al|A)(?=\s)/g, (w) => w.toLowerCase());
}

const NUMEROS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

/**
 * «Clase 1 de 4» solo si el nombre lo dice o trae la cantidad de clases y la lista de días
 * (y la fecha de la actividad es uno de esos días). Si no alcanza la información, null: no se inventa.
 */
export function claseDe(nombre: string, fecha: string): { n: number; total: number } | null {
  const t = normalizeText(nombre);
  const directa = t.match(/(?:clase|encuentro)\s*(\d+)\s*(?:de|\/)\s*(\d+)/);
  if (directa) return { n: Number(directa[1]), total: Number(directa[2]) };
  const cant = t.match(/\b(\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:clases|encuentros)\b/);
  if (!cant || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const total = Number(cant[1]) || NUMEROS[cant[1]];
  let dentro = normalizeText(nombre.match(/\(([^)]*)/)?.[1] ?? "");
  // Los días van antes del mes («2, 9, 16 y 23 de octubre de 18 a 20 hs»): lo que sigue (horario) no cuenta.
  const mes = dentro.search(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);
  if (mes <= 0) return null; // sin el mes no se puede distinguir días de horarios
  dentro = dentro.slice(0, mes);
  const dias = [...dentro.matchAll(/\b(\d{1,2})\b/g)].map((m) => Number(m[1])).filter((d) => d >= 1 && d <= 31);
  if (dias.length !== total) return null;
  const i = dias.indexOf(Number(fecha.slice(8, 10)));
  return i >= 0 ? { n: i + 1, total } : null;
}
