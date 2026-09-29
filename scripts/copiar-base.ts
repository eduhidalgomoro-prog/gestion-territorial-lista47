/**
 * Copia todas las hojas de la app de una planilla a otra (las columnas se ubican por encabezado).
 * La planilla destino tiene que estar preparada antes con setup:sheets.
 *
 * Uso: npx tsx --env-file=.env.local scripts/copiar-base.ts --desde <ID> --hacia <ID> [--probar]
 */
import { ALL_TABLES, TABLES } from "../src/lib/schema";
import { GoogleSheetsStore } from "../src/lib/store/google";

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : "");
const desde = arg("--desde");
const hacia = arg("--hacia");
const probar = process.argv.includes("--probar");

async function main() {
  if (!desde || !hacia || desde === hacia) throw new Error("Indicá --desde y --hacia (IDs distintos).");
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const origen = new GoogleSheetsStore(desde, email, key);
  const destino = new GoogleSheetsStore(hacia, email, key);
  const datos = await origen.read(ALL_TABLES);
  const yaHay = await destino.read(ALL_TABLES);
  for (const t of ALL_TABLES) {
    const filas = datos[t] ?? [];
    const previas = yaHay[t]?.length ?? 0;
    // CONFIG la carga setup:sheets en el destino: se reemplaza por la del origen solo si el destino está vacío de datos propios.
    if (t === "config") {
      const claves = new Set((yaHay.config ?? []).map((r) => String(r["Clave"])));
      const faltan = filas.filter((r) => !claves.has(String(r["Clave"])));
      const cambian = filas.filter((r) => claves.has(String(r["Clave"])));
      console.log(`${TABLES[t].sheet.padEnd(15)} ${filas.length} filas (${cambian.length} a actualizar, ${faltan.length} nuevas)`);
      if (!probar) {
        if (faltan.length) await destino.append(t, faltan);
        if (cambian.length) await destino.updateMany(t, "Clave", cambian);
      }
      continue;
    }
    if (t === "usuarios") {
      // setup:sheets ya agregó a los administradores iniciales: se reemplazan por los del origen.
      const emails = new Set((yaHay.usuarios ?? []).map((r) => String(r["Email"]).toLowerCase()));
      const faltan = filas.filter((r) => !emails.has(String(r["Email"]).toLowerCase()));
      const cambian = filas.filter((r) => emails.has(String(r["Email"]).toLowerCase()));
      console.log(`${TABLES[t].sheet.padEnd(15)} ${filas.length} filas (${cambian.length} a actualizar, ${faltan.length} nuevas)`);
      if (!probar) {
        if (faltan.length) await destino.append(t, faltan);
        if (cambian.length) await destino.updateMany(t, "Email", cambian);
      }
      continue;
    }
    if (previas) {
      console.log(`${TABLES[t].sheet.padEnd(15)} ✗ el destino ya tiene ${previas} filas: no se copia (para no duplicar)`);
      continue;
    }
    console.log(`${TABLES[t].sheet.padEnd(15)} ${filas.length} filas`);
    if (!probar && filas.length) {
      for (let i = 0; i < filas.length; i += 500) await destino.append(t, filas.slice(i, i + 500));
    }
  }
  if (!probar) {
    const fin = await destino.read(ALL_TABLES);
    console.log("\nVerificación (origen → destino):");
    let ok = true;
    for (const t of ALL_TABLES) {
      const a = datos[t]?.length ?? 0;
      const b = fin[t]?.length ?? 0;
      const bien = t === "config" || t === "usuarios" ? b >= a : a === b;
      if (!bien) ok = false;
      console.log(`  ${bien ? "✓" : "✗"} ${TABLES[t].sheet.padEnd(15)} ${a} → ${b}`);
    }
    console.log(ok ? "\n✓ Copia completa." : "\n✗ Hay diferencias: revisar antes de cambiar la app.");
  }
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
