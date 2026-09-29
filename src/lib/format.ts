/** Funciones puras de formato y normalización. Sirven en el servidor y en el navegador. */
export const TZ = "America/Argentina/Buenos_Aires";

// ---------------------------------------------------------------------------
// Fechas (siempre en la zona horaria de Corrientes)
// ---------------------------------------------------------------------------
/**
 * Fecha y hora en formato ISO con la hora de Argentina (ej. 2026-09-28T22:15:05-03:00):
 * se lee bien en la planilla y se ordena correctamente como texto.
 */
export function nowIso(d: Date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}-03:00`;
}

/** Fecha local YYYY-MM-DD. */
export function today(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** Fecha y hora local legible: 28/09/2026 14:05 */
export function nowLocal(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d).replace(",", "");
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Mes (1-12) y año de una fecha YYYY-MM-DD. */
export function mesAnio(fecha: string): { mes: number; anio: number } {
  if (!isValidDate(fecha)) return { mes: 0, anio: 0 };
  return { anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)) };
}

export function addMonths(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const idx = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(idx / 12), mes: (idx % 12) + 1 };
}

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? "";
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------
export function normalizeText(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string): string {
  return normalizeText(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function cleanString(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  // quita caracteres de control y recorta
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

export function titleCase(s: string): string {
  return (s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Barrios siempre en mayúsculas y sin espacios dobles (así no hay «San Benito» y «SAN BENITO»). */
export function normalizeBarrio(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

// ---------------------------------------------------------------------------
// Datos personales
// ---------------------------------------------------------------------------

/** DNI: solo dígitos (acepta puntos y espacios). Devuelve "" si no parece un DNI. */
export function normalizeDni(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 6 || d.length > 9) return "";
  return d.replace(/^0+/, "");
}

/**
 * Teléfono argentino a 10 dígitos cuando se puede (ej. «0379 15-4123456» → 3794123456).
 * Si no se reconoce el formato, deja solo los dígitos.
 */
export function normalizePhone(raw: string): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  // «15» después de la característica (2 a 4 dígitos): 379 15 4123456 → 3794123456
  if (d.length === 12) {
    for (const area of [3, 4, 2]) {
      if (d.slice(area, area + 2) === "15") {
        d = d.slice(0, area) + d.slice(area + 2);
        break;
      }
    }
  }
  // Número local sin característica (7 dígitos): se asume Corrientes (379)
  if (d.length === 7) d = "379" + d;
  return d;
}

/** Clave para detectar posibles duplicados por teléfono: últimos 8 dígitos. */
export function phoneKey(tel: string): string {
  const d = normalizePhone(tel);
  return d.length >= 8 ? d.slice(-8) : "";
}

/** DNI parcialmente oculto: ••• 456 789 → «••.•••.789» (para quien no es administrador). */
export function maskDni(dni: string): string {
  if (!dni) return "";
  return `••.•••.${dni.slice(-3)}`;
}

export function formatDni(dni: string): string {
  if (!dni) return "";
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function maskPhone(tel: string): string {
  if (!tel) return "";
  return `•••• ${tel.slice(-4)}`;
}

export function formatPhone(tel: string): string {
  const d = normalizePhone(tel);
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
  return tel;
}

// ---------------------------------------------------------------------------
// Formato para mostrar
// ---------------------------------------------------------------------------
export function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }): string {
  if (!date) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("es-AR", { timeZone: /T\d/.test(date) ? TZ : "UTC", ...opts }).format(d);
}

/** «07 OCT» para tarjetas. */
export function formatDiaMes(date: string): string {
  if (!isValidDate(date)) return "";
  return `${date.slice(8, 10)} ${MESES[Number(date.slice(5, 7)) - 1].slice(0, 3).toUpperCase()}`;
}

export function formatDateLong(date: string): string {
  return formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function fullName(p: { nombre: string; apellido: string } | undefined | null): string {
  if (!p) return "—";
  return `${p.nombre} ${p.apellido}`.trim() || "—";
}

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * Convierte fechas como vienen de Google Forms / Excel a YYYY-MM-DD:
 * «27/05/2026 17:58:33», «3/6/2026», «2026-06-03», o número de serie de Excel (46173).
 */
export function parseFechaFlexible(v: unknown): string {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseFechaFlexible(Number(s));
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    // Año mal tipeado como «0026» → 2026
    const y = Number(m[1]) < 1000 ? String(2000 + (Number(m[1]) % 100)) : m[1];
    const r = `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return isValidDate(r) ? r : "";
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : Number(m[3]) < 1000 ? String(2000 + (Number(m[3]) % 100)) : m[3];
    const r = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidDate(r) ? r : "";
  }
  return "";
}

/**
 * Fecha de nacimiento tal como la escribe la gente: corrige años «0082» → 1982 y «82» → 1982,
 * y descarta fechas imposibles (futuras o de hace más de 110 años).
 */
export function parseFechaNacimiento(v: unknown, hoy = today()): string {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{1,4})$/);
  let r = "";
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y > Number(hoy.slice(2, 4)) ? 1900 : 2000;
    else if (y < 1000) y = 1900 + (y % 100);
    r = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  } else {
    r = parseFechaFlexible(v);
  }
  if (!isValidDate(r)) return "";
  const edad = Number(hoy.slice(0, 4)) - Number(r.slice(0, 4));
  return r < hoy && edad >= 3 && edad <= 110 ? r : "";
}

export function edad(fechaNacimiento: string, hoy = today()): number | null {
  if (!isValidDate(fechaNacimiento)) return null;
  let e = Number(hoy.slice(0, 4)) - Number(fechaNacimiento.slice(0, 4));
  if (hoy.slice(5) < fechaNacimiento.slice(5)) e--;
  return e;
}

/** Horas como «19hs», «16.30», «9:30:00», «18 HS» → «HH:MM». «0:00:00» se toma como vacío. */
export function parseHoraFlexible(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?:[:.,](\d{2}))?(?::\d{2})?\s*(?:hs?|horas)?\.?$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 23 || min > 59 || (h === 0 && min === 0)) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}