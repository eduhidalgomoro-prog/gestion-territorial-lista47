/**
 * Genera el PDF de la guía del operativo de salud visual (lo que abre «Ver la guía completa» en la app).
 *   Fuente:  guias/operativo-salud-visual.html  (diseño A4, ilustraciones vectoriales dentro del archivo)
 *   Salida:  public/guias/operativo-salud-visual.pdf
 * Usa Chrome o Edge instalados, en modo sin ventana. Hace falta internet para las tipografías (quedan dentro del PDF).
 *
 * Uso:  npm run guia:visual
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const raiz = resolve(import.meta.dirname, "..");
const fuente = join(raiz, "guias", "operativo-salud-visual.html");
const salida = resolve(process.argv[2] ?? join(raiz, "public", "guias", "operativo-salud-visual.pdf"));

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
    "--virtual-time-budget=15000", // espera a que carguen las tipografías
    `--print-to-pdf=${salida}`,
    pathToFileURL(fuente).href,
  ],
  { stdio: "inherit" },
);
console.log(`✓ ${salida} (${Math.round(statSync(salida).size / 1024)} KB)`);
