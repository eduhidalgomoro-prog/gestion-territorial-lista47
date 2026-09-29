import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Row, TableName } from "../schema";
import { StoreError, type SheetStore } from "./types";

/**
 * Almacenamiento en memoria. Con `filePath` guarda una copia en disco (modo "local" para desarrollo).
 * No sirve en Vercel: allí siempre se usa Google Sheets.
 */
export class MemoryStore implements SheetStore {
  readonly kind: string;
  private tables: Partial<Record<TableName, Row[]>> = {};

  constructor(private readonly filePath?: string) {
    this.kind = filePath ? "local" : "memory";
    if (filePath && existsSync(filePath)) {
      this.tables = JSON.parse(readFileSync(filePath, "utf8"));
    }
  }

  async read(tables: TableName[]) {
    const out: Partial<Record<TableName, Row[]>> = {};
    for (const t of tables) out[t] = (this.tables[t] ?? []).map((r) => ({ ...r }));
    return out;
  }

  async append(table: TableName, rows: Row[]) {
    const list = (this.tables[table] ??= []);
    list.push(...rows.map((r) => ({ ...r })));
    this.persist();
  }

  async update(table: TableName, keyColumn: string, keyValue: string, row: Row) {
    const list = this.tables[table] ?? [];
    const i = list.findIndex((r) => String(r[keyColumn]) === keyValue);
    if (i < 0) throw new StoreError(`No se encontró ${keyValue} en ${table}`);
    list[i] = { ...list[i], ...row };
    this.persist();
  }

  async updateMany(table: TableName, keyColumn: string, rows: Row[]) {
    const list = this.tables[table] ?? [];
    for (const row of rows) {
      const key = String(row[keyColumn]);
      const i = list.findIndex((r) => String(r[keyColumn]) === key);
      if (i < 0) throw new StoreError(`No se encontró ${key} en ${table}`);
      list[i] = { ...list[i], ...row };
    }
    this.persist();
  }

  /** Solo para pruebas y datos de ejemplo. */
  reset(data: Partial<Record<TableName, Row[]>> = {}) {
    this.tables = JSON.parse(JSON.stringify(data));
    this.persist();
  }

  private persist() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.tables, null, 1));
  }
}
