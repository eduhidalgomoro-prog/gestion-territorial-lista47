/** Flyers subidos a la app (Vercel Blob). Sirve en el servidor y en el navegador. */

export function esFlyerSubido(url: string): boolean {
  return /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(url ?? "");
}

/** Link que fuerza la descarga del archivo (en vez de abrirlo). */
export function linkDescarga(url: string): string {
  return esFlyerSubido(url) ? `${url}${url.includes("?") ? "&" : "?"}download=1` : url;
}

export const FLYER_MAX_BYTES = 4 * 1024 * 1024;
export const FLYER_TIPOS = ["image/jpeg", "image/png", "image/webp"];
