import { auth, sheets, type sheets_v4 } from "@googleapis/sheets";
import { TABLES, type Row, type TableName } from "../schema";
import { StoreError, type SheetStore } from "./types";

function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const range = (table: TableName, a1 = "A1:ZZ") => `'${TABLES[table].sheet}'!${a1}`;

function friendly(err: unknown, action: string): StoreError {
  const e = err as { code?: number; message?: string };
  let msg = `No pudimos ${action} en la planilla.`;
  if (e?.code === 403) msg += " La cuenta de servicio no tiene permiso: compartí la planilla con su email como Editor.";
  else if (e?.code === 404) msg += " No se encontró la planilla o una hoja: revisá GOOGLE_SHEETS_SPREADSHEET_ID y ejecutá npm run setup:sheets.";
  else if (e?.code === 429) msg += " Google limitó las solicitudes por un momento. Probá de nuevo en un minuto.";
  else msg += " Probá de nuevo en unos segundos.";
  return new StoreError(msg, err);
}

/**
 * Google Sheets vía cuenta de servicio. Las columnas se ubican por el nombre del encabezado (fila 1),
 * así que se pueden reordenar o agregar columnas propias en la planilla sin romper la app.
 */
export class GoogleSheetsStore implements SheetStore {
  readonly kind = "sheets";
  private api: sheets_v4.Sheets;
  private headers = new Map<TableName, string[]>();

  constructor(private readonly spreadsheetId: string, email: string, key: string, api?: sheets_v4.Sheets) {
    if (api) {
      this.api = api; // solo pruebas
      return;
    }
    if (!spreadsheetId || !email || !key) {
      throw new StoreError(
        "Falta configurar Google Sheets (GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).",
      );
    }
    const client = new auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    this.api = sheets({ version: "v4", auth: client });
  }

  private rowsFromValues(table: TableName, values: unknown[][] | null | undefined): Row[] {
    const [header = [], ...rest] = values ?? [];
    const cols = header.map((h) => String(h).trim());
    this.headers.set(table, cols);
    const rows: Row[] = [];
    for (const line of rest) {
      if (!line || line.every((v) => v === "" || v === null || v === undefined)) continue;
      const r: Row = {};
      cols.forEach((c, i) => {
        const v = line[i];
        r[c] = typeof v === "number" ? v : v === undefined || v === null ? "" : String(v);
      });
      rows.push(r);
    }
    return rows;
  }

  async read(tables: TableName[]) {
    try {
      const res = await this.api.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId,
        ranges: tables.map((t) => range(t)),
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING",
      });
      const out: Partial<Record<TableName, Row[]>> = {};
      tables.forEach((t, i) => {
        out[t] = this.rowsFromValues(t, res.data.valueRanges?.[i]?.values as unknown[][]);
      });
      return out;
    } catch (err) {
      throw friendly(err, "leer los datos");
    }
  }

  private async headerFor(table: TableName): Promise<string[]> {
    const cached = this.headers.get(table);
    if (cached?.length) return cached;
    await this.read([table]);
    const h = this.headers.get(table);
    if (!h?.length) throw new StoreError(`La hoja ${TABLES[table].sheet} no tiene encabezados. Ejecutá npm run setup:sheets.`);
    return h;
  }

  private toArray(header: string[], row: Row, previous?: unknown[]): (string | number)[] {
    return header.map((c, i) => {
      if (c in row) return row[c];
      const prev = previous?.[i];
      return prev === undefined || prev === null ? "" : (prev as string | number);
    });
  }

  async append(table: TableName, rows: Row[]) {
    const header = await this.headerFor(table);
    try {
      await this.api.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: range(table, "A1"),
        valueInputOption: "RAW", // RAW: nunca interpreta fórmulas (evita inyección)
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows.map((r) => this.toArray(header, r)) },
      });
    } catch (err) {
      throw friendly(err, "guardar");
    }
  }

  async updateMany(table: TableName, keyColumn: string, rows: Row[]) {
    if (!rows.length) return;
    let values: unknown[][];
    try {
      const res = await this.api.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: range(table),
        valueRenderOption: "UNFORMATTED_VALUE",
      });
      values = (res.data.values as unknown[][]) ?? [];
    } catch (err) {
      throw friendly(err, "leer los datos");
    }
    const header = (values[0] ?? []).map((h) => String(h).trim());
    this.headers.set(table, header);
    const keyIdx = header.indexOf(keyColumn);
    if (keyIdx < 0) throw new StoreError(`La hoja ${TABLES[table].sheet} no tiene la columna ${keyColumn}.`);
    const index = new Map<string, number>();
    values.forEach((line, i) => {
      if (i > 0) index.set(String(line?.[keyIdx] ?? ""), i);
    });
    const last = colLetter(header.length - 1);
    const data = rows.map((row) => {
      const key = String(row[keyColumn]);
      const rowIdx = index.get(key);
      if (rowIdx === undefined) throw new StoreError(`No se encontró ${key} en ${TABLES[table].sheet}.`);
      const n = rowIdx + 1;
      return { range: range(table, `A${n}:${last}${n}`), values: [this.toArray(header, row, values[rowIdx])] };
    });
    try {
      await this.api.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: { valueInputOption: "RAW", data },
      });
    } catch (err) {
      throw friendly(err, "guardar");
    }
  }

  async update(table: TableName, keyColumn: string, keyValue: string, row: Row) {
    let values: unknown[][];
    try {
      const res = await this.api.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: range(table),
        valueRenderOption: "UNFORMATTED_VALUE",
      });
      values = (res.data.values as unknown[][]) ?? [];
    } catch (err) {
      throw friendly(err, "leer los datos");
    }
    const header = (values[0] ?? []).map((h) => String(h).trim());
    this.headers.set(table, header);
    const keyIdx = header.indexOf(keyColumn);
    if (keyIdx < 0) throw new StoreError(`La hoja ${TABLES[table].sheet} no tiene la columna ${keyColumn}.`);
    const rowIdx = values.findIndex((line, i) => i > 0 && String(line?.[keyIdx] ?? "") === keyValue);
    if (rowIdx < 0) throw new StoreError(`No se encontró ${keyValue} en ${TABLES[table].sheet}.`);
    const n = rowIdx + 1;
    try {
      await this.api.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: range(table, `A${n}:${colLetter(header.length - 1)}${n}`),
        valueInputOption: "RAW",
        requestBody: { values: [this.toArray(header, row, values[rowIdx])] },
      });
    } catch (err) {
      throw friendly(err, "guardar");
    }
  }
}

export { colLetter };
