// Sin "server-only": también lo usa el script de migración (scripts/migrar-formulario.ts).

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

// Ciudad de Corrientes (con margen).
export const CORRIENTES = { lat: -27.4806, lng: -58.8341, bounds: { minLat: -27.62, maxLat: -27.36, minLng: -58.98, maxLng: -58.66 } };
// Provincia de Corrientes (con margen): las coordenadas fuera de esta zona se descartan.
export const PROVINCIA: Bounds = { minLat: -30.85, maxLat: -27.2, minLng: -59.75, maxLng: -55.6 };

function dentro(lat: number, lng: number, b: Bounds) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export function coordsValidas(lat: number, lng: number) {
  return dentro(lat, lng, PROVINCIA);
}

/**
 * Ubica una dirección en la ciudad de Corrientes.
 * 1) Georef (API oficial de datos.gob.ar): muy buena con «calle + altura».
 * 2) OpenStreetMap / Nominatim: sirve para esquinas, plazas y lugares con nombre.
 * 3) Si nada funciona, el centro del barrio (aproximado).
 * Siempre se puede corregir moviendo el marcador en el mapa.
 */

export interface Ubicacion {
  lat: number;
  lng: number;
  fuente: "georef" | "osm" | "barrio";
  aproximado: boolean;
  descripcion: string;
}

const UA = "GestionTerritorialLista47/1.0 (gestion territorial Corrientes)";

async function fetchJson(url: string, ms = 6000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function georef(direccion: string): Promise<Ubicacion | null> {
  const url = new URL("https://apis.datos.gob.ar/georef/api/direcciones");
  url.searchParams.set("direccion", direccion);
  url.searchParams.set("provincia", "Corrientes");
  url.searchParams.set("departamento", "Capital");
  url.searchParams.set("max", "1");
  const data = (await fetchJson(url.toString())) as { direcciones?: { ubicacion?: { lat?: number; lon?: number }; nomenclatura?: string }[] } | null;
  const d = data?.direcciones?.[0];
  const lat = Number(d?.ubicacion?.lat);
  const lng = Number(d?.ubicacion?.lon);
  if (!dentro(lat, lng, CORRIENTES.bounds)) return null;
  return { lat, lng, fuente: "georef", aproximado: false, descripcion: d?.nomenclatura ?? direccion };
}

async function nominatim(q: string, b: Bounds = CORRIENTES.bounds): Promise<{ lat: number; lng: number; display: string } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("viewbox", `${b.minLng},${b.maxLat},${b.maxLng},${b.minLat}`);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("limit", "1");
  const data = (await fetchJson(url.toString())) as { lat?: string; lon?: string; display_name?: string }[] | null;
  const r = data?.[0];
  const lat = Number(r?.lat);
  const lng = Number(r?.lon);
  if (!dentro(lat, lng, b)) return null;
  return { lat, lng, display: r?.display_name ?? q };
}

/** Localidades del interior: OpenStreetMap dentro de la provincia; si no, el barrio o el centro del pueblo (aproximado). */
async function geocodificarInterior(dir: string, barrio: string, localidad: string): Promise<Ubicacion | null> {
  const donde = `${localidad}, Corrientes, Argentina`;
  if (dir) {
    const q = dir.replace(/\s(esq\.?|esquina)\s/i, " y ");
    const n = await nominatim(`${q}, ${donde}`, PROVINCIA);
    if (n) return { lat: n.lat, lng: n.lng, fuente: "osm", aproximado: !/\d|\sy\s/i.test(q), descripcion: n.display };
  }
  if (barrio) {
    const n = await nominatim(`Barrio ${barrio}, ${donde}`, PROVINCIA);
    if (n) return { lat: n.lat, lng: n.lng, fuente: "barrio", aproximado: true, descripcion: n.display };
  }
  const n = await nominatim(donde, PROVINCIA);
  return n ? { lat: n.lat, lng: n.lng, fuente: "barrio", aproximado: true, descripcion: n.display } : null;
}

export async function geocodificar(direccion: string, barrio: string, localidad = ""): Promise<Ubicacion | null> {
  const dir = direccion.trim();
  if (localidad.trim()) return geocodificarInterior(dir, barrio.trim(), localidad.trim());
  const esEsquina = /\s(y|esq\.?|esquina)\s/i.test(dir);
  if (dir && !esEsquina && /\d/.test(dir)) {
    const g = await georef(dir);
    if (g) return g;
  }
  if (dir) {
    const q = esEsquina ? dir.replace(/\s(esq\.?|esquina)\s/i, " y ") : dir;
    const n = await nominatim(`${q}, Corrientes, Argentina`);
    if (n) return { lat: n.lat, lng: n.lng, fuente: "osm", aproximado: esEsquina ? false : !/\d/.test(dir), descripcion: n.display };
  }
  if (barrio.trim()) {
    const n = await nominatim(`Barrio ${barrio.trim()}, Corrientes, Argentina`);
    if (n) return { lat: n.lat, lng: n.lng, fuente: "barrio", aproximado: true, descripcion: n.display };
  }
  return null;
}
