/**
 * Genera el PDF de una guía a partir de su diseño en HTML (A4, ilustraciones dentro del archivo).
 *   Fuente:  guias/<nombre>.html
 *   Salida:  public/guias/<nombre>.pdf  (se abre en la app y se puede compartir por WhatsApp)
 * Usa Chrome o Edge instalados, en modo sin ventana. Hace falta internet para las tipografías (quedan dentro del PDF).
 *
 * Uso:  npm run guia:visual  ·  npm run guia:carga   (o: node scripts/generar-guia.mjs <nombre> [salida.pdf])
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const raiz = resolve(import.meta.dirname, "..");
const nombre = process.argv[2] ?? "operativo-salud-visual";
const fuente = join(raiz, "guias", `${nombre}.html`);
const salida = resolve(process.argv[3] ?? join(raiz, "public", "guias", `${nombre}.pdf`));
if (!existsSync(fuente)) {
  console.error(`No existe ${fuente}`);
  process.exit(1);
}

const candidatos = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const navegador = candidatos.find((c) => existsSync(c));
if (!navegador) {
  console.error("No encontré Chrome ni Edge. Indicá la ruta con CHROME_PATH.");
  process.exit(1);
}

execFileSync(
  navegador,
  [
    "--headless=new",
    `--user-data-dir=${join(tmpdir(), "gt47-guia-chrome")}`, // perfil aparte: no toca el Chrome de la persona
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=15000", // espera a que carguen las tipografías y las imágenes
    `--print-to-pdf=${salida}`,
    pathToFileURL(fuente).href,
  ],
  { stdio: "inherit" },
);
console.log(`✓ ${salida} (${Math.round(statSync(salida).size / 1024)} KB)`);
if (nombre === "operativo-salud-visual") {
  console.log("Recordá actualizar GUIA_VISUAL_VERSION en src/lib/guias.ts para que todos vean la versión nueva.");
}
