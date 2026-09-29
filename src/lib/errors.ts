import { ConflictError, NotFoundError } from "./db";
import { BusyError } from "./lock";
import { StoreError } from "./store";

/** Error con un mensaje pensado para mostrarse tal cual a quien usa la app. */
export class UserError extends Error {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message);
    this.name = "UserError";
  }
}

/** Sin permiso para esta acción (según el rol). */
export class ForbiddenError extends UserError {
  constructor(message = "No tenés permiso para hacer esto.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
  data?: T;
}

/** Convierte cualquier error en un mensaje comprensible (y registra los inesperados). */
export function toActionError(err: unknown): ActionResult<never> {
  if (err instanceof UserError) return { ok: false, message: err.message, fields: err.fields };
  if (err instanceof ConflictError || err instanceof NotFoundError || err instanceof BusyError || err instanceof StoreError) {
    if (err instanceof StoreError) console.error("[store]", err.cause ?? err);
    return { ok: false, message: err.message };
  }
  // Los redirect/notFound de Next se propagan.
  if (err && typeof err === "object" && "digest" in err) throw err;
  console.error("[error inesperado]", err);
  return { ok: false, message: "Algo salió mal. Probá de nuevo y, si sigue pasando, avisá a la coordinación." };
}
