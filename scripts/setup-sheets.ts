/**
 * Prepara la planilla maestra de Google Sheets: crea las hojas que falten (ACTIVIDADES, PARTICIPANTES, …),
 * escribe los encabezados, agrega desplegables, congela la fila 1, carga la configuración inicial
 * y da de alta a los administradores iniciales (ADMIN_EMAILS) en USUARIOS.
 *
 * Es seguro ejecutarlo varias veces: nunca borra ni reordena datos; si falta una columna, la agrega al final.
 * No toca las hojas que ya existían (por ejemplo «Respuestas de formulario 1»).
 *
 * Uso:  npm run setup:sheets            (lee .env.local)
 *       npm run check:sheets            (solo verifica la conexión, no cambia nada)
 */
import { randomBytes } from "node:crypto";
import { auth, sheets, type sheets_v4 } from "@googleapis/sheets";
import { configToValue, CONFIG_KEYS, CONFIG_LABELS, DEFAULT_CONFIG } from "../src/lib/config";
import { ALL_TABLES, ENTITY_TABLES, TABLES, headers, type TableName } from "../src/lib/schema";
import { colLetter } from "../src/lib/store/google";

const soloVerificar = process.argv.includes("--check");

function env(name: string) {
  const v = (process.env[name] ?? "").trim();
  if (!v) {
    console.error(`✗ Falta ${name} en .env.local`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const spreadsheetId = env("GOOGLE_SHEETS_SPREADSHEET_ID");
  const client = new auth.JWT({
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const api = sheets({ version: "v4", auth: client });

  let meta: sheets_v4.Schema$Spreadsheet;
  try {
    meta = (await api.spreadsheets.get({ spreadsheetId })).data;
  } catch (e) {
    const code = (e as { code?: number }).code;
    console.error(
      code === 403
        ? `✗ Sin permiso. Compartí la planilla con ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} como Editor.`
        : code === 404
          ? "✗ No se encontró la planilla. Revisá GOOGLE_SHEETS_SPREADSHEET_ID."
          : `✗ No se pudo conectar: ${(e as Error).message}`,
    );
    process.exit(1);
  }
  console.log(`✓ Conectado a «${meta.properties?.title}»`);
  console.log(`  Hojas actuales: ${(meta.sheets ?? []).map((s) => s.properties?.title).join(", ")}`);
  if (soloVerificar) return;

  const existentes = new Map((meta.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.sheetId!]));

  // 1. Hojas faltantes
  const faltan = ALL_TABLES.filter((t) => !existentes.has(TABLES[t].sheet));
  if (faltan.length) {
    const res = await api.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: faltan.map((t) => ({ addSheet: { properties: { title: TABLES[t].sheet } } })) },
    });
    for (const r of res.data.replies ?? []) existentes.set(r.addSheet!.properties!.title!, r.addSheet!.properties!.sheetId!);
    console.log(`✓ Hojas creadas: ${faltan.map((t) => TABLES[t].sheet).join(", ")}`);
  }

  // 2. Encabezados (sin borrar ni reordenar)
  const heads = await api.spreadsheets.values.batchGet({ spreadsheetId, ranges: ALL_TABLES.map((t) => `'${TABLES[t].sheet}'!1:1`) });
  const headerFinal = new Map<TableName, string[]>();
  const writes: sheets_v4.Schema$ValueRange[] = [];
  ALL_TABLES.forEach((t, i) => {
    const actual = ((heads.data.valueRanges?.[i]?.values?.[0] ?? []) as string[]).map((h) => String(h).trim());
    const agregar = headers(t).filter((c) => !actual.includes(c));
    const final = [...actual, ...agregar];
    headerFinal.set(t, final);
    if (agregar.length) {
      writes.push({ range: `'${TABLES[t].sheet}'!${colLetter(actual.length)}1`, values: [agregar] });
      console.log(`✓ ${TABLES[t].sheet}: ${actual.length ? "columnas agregadas" : "encabezados"} (${agregar.length})`);
    }
  });
  // Si la hoja no tiene columnas suficientes, se agregan antes de escribir los encabezados nuevos.
  const cols = new Map((meta.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.gridProperties?.columnCount ?? 26]));
  const agrandar: sheets_v4.Schema$Request[] = [];
  for (const t of ALL_TABLES) {
    const faltanCols = headerFinal.get(t)!.length - (cols.get(TABLES[t].sheet) ?? 26);
    if (faltanCols > 0) agrandar.push({ appendDimension: { sheetId: existentes.get(TABLES[t].sheet)!, dimension: "COLUMNS", length: faltanCols + 5 } });
  }
  if (agrandar.length) await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: agrandar } });
  if (writes.length) await api.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: writes } });

  // 3. Formato, texto plano (para que Sheets no convierta DNI, fechas u horas) y desplegables
  const requests: sheets_v4.Schema$Request[] = [];
  for (const t of ALL_TABLES) {
    const def = TABLES[t];
    const sheetId = existentes.get(def.sheet)!;
    const header = headerFinal.get(t)!;
    requests.push(
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.063, green: 0.412, blue: 0.522 } } },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      },
    );
    for (const [key, head] of def.columns) {
      const idx = header.indexOf(head);
      if (idx < 0) continue;
      const numerica = key === "version" || def.numeric?.includes(key);
      const moneda = key.startsWith("costo");
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: idx, endColumnIndex: idx + 1 },
          cell: { userEnteredFormat: { numberFormat: numerica ? { type: "NUMBER", pattern: moneda ? "$ #,##0" : key === "lat" || key === "lng" ? "0.000000" : "0" } : { type: "TEXT" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }
    // «Zona» ya no tiene lista fija (incluye las regiones del interior): se quita el desplegable viejo.
    if (t === "actividades" || t === "usuarios") {
      const idx = header.indexOf(t === "actividades" ? "Zona" : "Zona asignada");
      if (idx >= 0) requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, startColumnIndex: idx, endColumnIndex: idx + 1 } } });
    }
    const listas: Record<string, readonly string[]> = { ...(def.enums ?? {}) };
    for (const b of def.boolean ?? []) listas[b] = ["SI", "NO"];
    for (const [key, valores] of Object.entries(listas)) {
      const head = def.columns.find((c) => c[0] === key)?.[1];
      const idx = head ? header.indexOf(head) : -1;
      if (idx < 0) continue;
      requests.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: idx, endColumnIndex: idx + 1 },
          rule: {
            condition: { type: "ONE_OF_LIST", values: valores.filter(Boolean).map((v) => ({ userEnteredValue: v })) },
            strict: false, // avisa pero no bloquea (la app valida igual)
            showCustomUi: true,
          },
        },
      });
    }
  }
  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  console.log("✓ Formato y desplegables aplicados");

  // 4. Configuración inicial (solo claves que no existan)
  const cfg = await api.spreadsheets.values.get({ spreadsheetId, range: `'${TABLES.config.sheet}'!A2:A` });
  const claves = new Set((cfg.data.values ?? []).map((r) => String(r[0])));
  const nuevas = CONFIG_KEYS.filter((k) => !claves.has(k)).map((k) => [k, configToValue(k, DEFAULT_CONFIG[k]), CONFIG_LABELS[k].descripcion]);
  if (nuevas.length) {
    await api.spreadsheets.values.append({ spreadsheetId, range: `'${TABLES.config.sheet}'!A1`, valueInputOption: "RAW", requestBody: { values: nuevas } });
    console.log(`✓ Configuración inicial: ${nuevas.map((n) => n[0]).join(", ")}`);
  }

  // 5. Administradores iniciales en USUARIOS
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (admins.length) {
    const hU = headerFinal.get("usuarios")!;
    const u = await api.spreadsheets.values.get({ spreadsheetId, range: `'${TABLES.usuarios.sheet}'!A1:ZZ` });
    const emailIdx = hU.indexOf("Email");
    const ya = new Set((u.data.values ?? []).slice(1).map((r) => String(r[emailIdx] ?? "").toLowerCase()));
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const filas = admins
      .filter((e) => !ya.has(e))
      .map((e) => {
        const row: Record<string, string | number> = {
          "ID Usuario": `USR-${randomBytes(4).toString("hex").toUpperCase()}`, Nombre: e.split("@")[0], Apellido: "", Email: e,
          Rol: "ADMINISTRADOR", "Zona asignada": "", Estado: "ACTIVO", Creado: now, "Última modificación": now, "Modificado por": "setup", Versión: 1,
        };
        return hU.map((h) => row[h] ?? "");
      });
    if (filas.length) {
      await api.spreadsheets.values.append({ spreadsheetId, range: `'${TABLES.usuarios.sheet}'!A1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: filas } });
      console.log(`✓ Administradores agregados a USUARIOS: ${admins.filter((e) => !ya.has(e)).join(", ")}`);
    }
  }

  console.log(`\nListo. Hojas de la app: ${ENTITY_TABLES.map((t) => TABLES[t].sheet).join(", ")}, ZONAS_BARRIOS, CONFIG, AUDITORIA.`);
  console.log("Siguiente paso (opcional): npm run migrar:formulario -- --probar   para traer las actividades del formulario anterior.");
}

main().catch((e) => {
  console.error("✗ Error inesperado:", e);
  process.exit(1);
});
