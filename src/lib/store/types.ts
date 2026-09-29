import type { Row, TableName } from "../schema";

/**
 * Almacenamiento de filas. La app no sabe si detrás hay Google Sheets o un archivo local:
 * eso permite probar todo sin conexión y, a futuro, migrar a una base de datos (Postgres, Supabase…)
 * reescribiendo SOLO esta capa.
 */
export interface SheetStore {
  readonly kind: string;
  /** Lee todas las filas de las tablas pedidas (una sola llamada a la API cuando es Sheets). */
  read(tables: TableName[]): Promise<Partial<Record<TableName, Row[]>>>;
  append(table: TableName, rows: Row[]): Promise<void>;
  /** Reemplaza la fila cuya columna `keyColumn` vale `keyValue`. Falla si no existe. */
  update(table: TableName, keyColumn: string, keyValue: string, row: Row): Promise<void>;
  /** Reemplaza varias filas de una vez (una lectura + una escritura). Las claves que no existan fallan. */
  updateMany(table: TableName, keyColumn: string, rows: Row[]): Promise<void>;
}

export class StoreError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "StoreError";
  }
}
