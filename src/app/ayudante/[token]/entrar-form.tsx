"use client";

import { useActionState } from "react";
import { btn, cx } from "@/components/ui";
import type { ActionResult } from "@/lib/errors";
import { entrarAyudanteAction } from "../actions";

export function EntrarAyudante({ token }: { token: string }) {
  const [state, action, pending] = useActionState(entrarAyudanteAction.bind(null, token), { ok: true } as ActionResult);
  const error = state.fields?.nombre;
  return (
    <form action={action} className="mt-5" noValidate>
      {!state.ok && state.message && !error && <p role="alert" className="mb-3 rounded-xl bg-peligro-50 px-3 py-2 text-[15px] text-peligro">{state.message}</p>}
      <label htmlFor="nombre" className="mb-1.5 block text-[16px] font-bold">Tu nombre y apellido</label>
      <input
        id="nombre"
        name="nombre"
        autoComplete="name"
        enterKeyHint="go"
        maxLength={60}
        required
        aria-invalid={!!error}
        aria-describedby="nombre-ayuda"
        className="block min-h-13 w-full rounded-xl border border-linea bg-white px-4 text-[17px] focus:border-petroleo focus:outline-none aria-[invalid=true]:border-peligro"
        placeholder="Ej: María López"
      />
      <p id="nombre-ayuda" className={cx("mt-1.5 text-[14px]", error ? "font-semibold text-peligro" : "text-gris")}>
        {error ?? "Así queda registrado quién cargó cada dato."}
      </p>
      <button type="submit" disabled={pending} className={cx(btn("primario", "lg"), "mt-5 w-full")}>
        {pending ? "Entrando…" : "Empezar a cargar"}
      </button>
    </form>
  );
}
