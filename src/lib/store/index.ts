import { join } from "node:path";
import { env } from "../env";
import { GoogleSheetsStore } from "./google";
import { MemoryStore } from "./memory";
import type { SheetStore } from "./types";

const g = globalThis as unknown as { __gtStore?: SheetStore };

export function getStore(): SheetStore {
  if (g.__gtStore) return g.__gtStore;
  const backend = env.dataBackend();
  if (process.env.VERCEL && backend !== "sheets") {
    throw new Error("En Vercel DATA_BACKEND debe ser 'sheets'.");
  }
  g.__gtStore =
    backend === "sheets"
      ? new GoogleSheetsStore(env.spreadsheetId(), env.serviceAccountEmail(), env.serviceAccountKey())
      : backend === "local"
        ? new MemoryStore(join(process.cwd(), ".data", "local-db.json"))
        : new MemoryStore();
  return g.__gtStore;
}

/** Solo para pruebas. */
export function setStore(store: SheetStore | undefined) {
  g.__gtStore = store;
}

export { StoreError } from "./types";
export type { SheetStore } from "./types";
