"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { useSubmitWithoutReset } from "@/components/forms";
import { titleCase } from "@/lib/format";
import type { Pregunta } from "@/lib/preguntas";
import { inscribirAction, type InscripcionState } from "./actions";

const field =
  "block w-full h-12 rounded-xl border border-linea bg-white px-3.5 text-tinta placeholder:text-gris/60 focus:outline-none focus:border-petroleo aria-[invalid=true]:border-peligro";

function F({ label, name, error, optional, children }: { label: string; name: string; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={name} className="mb-1.5 block text-[15px] font-bold">
        {label} {optional && <span className="font-normal text-gris">(opcional)</span>}
      </label>
      {children}
      {error && <p id={`${name}-err`} className="mt-1 text-sm font-semibold text-peligro">{error}</p>}
    </div>
  );
}

export function InscripcionForm({ slug, token, preguntas, barrios }: { slug: string; token: string; preguntas: Pregunta[]; barrios: string[] }) {
  const [state, action, pending] = useActionState<InscripcionState, FormData>(inscribirAction.bind(null, slug), { ok: true });
  const onSubmit = useSubmitWithoutReset(action);
  const [otro, setOtro] = useState(false);
  const e = state.fields ?? {};

  if (state.ok && state.data) {
    return (
      <div role="status" className="rounded-2xl bg-white p-6 text-center ring-1 ring-verde">
        <p className="font-titulo text-2xl font-extrabold text-marca">¡Listo{state.data.nombre ? `, ${state.data.nombre}` : ""}!</p>
        <p className="mt-2 text-[16px] leading-relaxed">Tu inscripción quedó registrada. ¡Te esperamos!</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-3xl bg-white p-5 ring-1 ring-linea sm:p-7">
      {state.message && (
        <div role="alert" className="mb-4 rounded-xl bg-peligro-50 px-4 py-3 text-[15px] text-peligro">
          {state.message}
        </div>
      )}
      <input type="hidden" name="_t" value={token} />
      {/* Campo trampa: invisible para personas */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>No completar<input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <F label="Nombre" name="nombre" error={e.nombre}>
          <input id="nombre" name="nombre" autoComplete="given-name" required aria-invalid={!!e.nombre} className={field} />
        </F>
        <F label="Apellido" name="apellido" error={e.apellido}>
          <input id="apellido" name="apellido" autoComplete="family-name" required aria-invalid={!!e.apellido} className={field} />
        </F>
      </div>
      <F label="DNI" name="dni" error={e.dni}>
        <input id="dni" name="dni" inputMode="numeric" autoComplete="off" placeholder="Sin puntos" required aria-invalid={!!e.dni} className={field} />
      </F>
      <F label="Teléfono (WhatsApp)" name="telefono" error={e.telefono}>
        <input id="telefono" name="telefono" type="tel" inputMode="tel" autoComplete="tel" placeholder="Ej: 379 4123456" required aria-invalid={!!e.telefono} className={field} />
      </F>
      <F label="Barrio" name="barrio" error={e.barrio}>
        <select id="barrio" name="barrio" required aria-invalid={!!e.barrio} className={field} onChange={(ev) => setOtro(ev.target.value === "__otro")} defaultValue="">
          <option value="" disabled>Elegí tu barrio…</option>
          {barrios.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
          <option value="__otro">Otro barrio</option>
        </select>
        {otro && <input name="barrio_otro" placeholder="Escribí tu barrio" className={`${field} mt-2`} aria-label="Nombre de tu barrio" />}
      </F>

      <F label="Dirección" name="direccion" optional>
        <input id="direccion" name="direccion" autoComplete="street-address" placeholder="Calle y altura, o manzana y casa" className={field} />
      </F>
      <F label="Fecha de nacimiento" name="fecha_nacimiento" optional>
        <input id="fecha_nacimiento" name="fecha_nacimiento" type="date" autoComplete="bday" className={field} />
      </F>

      {preguntas.map((q, i) =>
        q.opciones ? (
          <fieldset key={i} className="mb-4">
            <legend className="mb-1.5 text-[15px] font-bold">{q.texto}</legend>
            <div className="flex flex-wrap gap-2">
              {q.opciones.map((o) => (
                <label key={o} className="cursor-pointer">
                  <input type="radio" name={`respuesta-${i}`} value={o} className="peer sr-only" />
                  <span className="inline-flex min-h-11 items-center rounded-full border border-linea bg-white px-5 text-[15px] font-semibold peer-checked:border-marca peer-checked:bg-verde-50 peer-checked:text-marca-600 peer-focus-visible:outline-2 peer-focus-visible:outline-petroleo">
                    {o}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <F key={i} label={q.texto} name={`respuesta-${i}`} optional>
            <input id={`respuesta-${i}`} name={`respuesta-${i}`} className={field} />
          </F>
        ),
      )}

      <label className="my-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-fondo p-4 text-[15px]">
        <input type="checkbox" name="consentimiento" required className="mt-0.5 size-5 shrink-0 accent-[#3f742c]" aria-invalid={!!e.consentimiento} />
        <span>
          Acepto que mis datos se usen para gestionar esta inscripción y contactarme por actividades del espacio (
          <Link href="/privacidad" target="_blank" className="underline">aviso de privacidad</Link>).
        </span>
      </label>
      {e.consentimiento && <p className="-mt-3 mb-4 text-sm font-semibold text-peligro">{e.consentimiento}</p>}

      <button type="submit" disabled={pending} className="h-14 w-full rounded-full bg-marca text-[16px] font-extrabold tracking-wide text-white uppercase hover:bg-marca-600 disabled:opacity-60">
        {pending ? "Enviando…" : "Quiero inscribirme"}
      </button>
    </form>
  );
}
