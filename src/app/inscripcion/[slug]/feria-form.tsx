"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { useSubmitWithoutReset } from "@/components/forms";
import { LLEVA_OPCIONES } from "@/lib/ferias";
import { inscribirFeriaAction, type FeriaState } from "./actions";

const field =
  "block w-full h-12 rounded-xl border border-linea bg-white px-3.5 text-tinta placeholder:text-gris/60 focus:outline-none focus:border-petroleo aria-[invalid=true]:border-peligro";

function F({ label, name, error, optional, hint, children }: { label: string; name: string; error?: string; optional?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={name} className="mb-1.5 block text-[15px] font-bold">
        {label} {optional && <span className="font-normal text-gris">(opcional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-gris">{hint}</p>}
      {error && <p className="mt-1 text-sm font-semibold text-peligro">{error}</p>}
    </div>
  );
}

const chip =
  "inline-flex min-h-11 items-center rounded-full border border-linea bg-white px-4 text-[15px] font-semibold peer-checked:border-marca peer-checked:bg-verde-50 peer-checked:text-marca-600 peer-focus-visible:outline-2 peer-focus-visible:outline-petroleo";

/** Formulario público de inscripción a una feria de emprendedoras. */
export function FeriaForm({ slug, token, rubros }: { slug: string; token: string; rubros: string[] }) {
  const [state, action, pending] = useActionState<FeriaState, FormData>(inscribirFeriaAction.bind(null, slug), { ok: true });
  const onSubmit = useSubmitWithoutReset(action);
  const e = state.fields ?? {};

  if (state.ok && state.data) {
    return (
      <div role="status" className="rounded-2xl bg-white p-6 text-center ring-1 ring-verde">
        <p className="font-titulo text-2xl font-extrabold text-marca">¡Listo{state.data.nombre ? `, ${state.data.nombre}` : ""}!</p>
        <p className="mt-2 text-[16px] leading-relaxed">
          {state.data.status === "ya"
            ? "Ya estabas inscripta: actualizamos tus datos."
            : "Tu lugar en la feria quedó reservado. Antes de la feria te vamos a avisar por WhatsApp qué puesto te tocó."}
        </p>
      </div>
    );
  }
  if (!state.ok && state.data?.motivo) {
    return <p className="rounded-2xl bg-white p-6 text-center text-[16px] font-semibold ring-1 ring-linea">{state.data.motivo}</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-3xl bg-white p-5 ring-1 ring-linea sm:p-7">
      {state.message && (
        <div role="alert" className="mb-4 rounded-xl bg-peligro-50 px-4 py-3 text-[15px] text-peligro">
          {state.message}
        </div>
      )}
      <input type="hidden" name="_t" value={token} />
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
      <F label="Contacto (WhatsApp)" name="telefono" error={e.telefono} hint="Por acá te avisamos qué puesto te tocó.">
        <input id="telefono" name="telefono" type="tel" inputMode="tel" autoComplete="tel" placeholder="Ej: 379 4123456" required aria-invalid={!!e.telefono} className={field} />
      </F>
      <F label="DNI" name="dni" optional error={e.dni}>
        <input id="dni" name="dni" inputMode="numeric" autoComplete="off" placeholder="Sin puntos" aria-invalid={!!e.dni} className={field} />
      </F>
      <F label="Nombre del emprendimiento" name="emprendimiento" error={e.emprendimiento}>
        <input id="emprendimiento" name="emprendimiento" required aria-invalid={!!e.emprendimiento} className={field} />
      </F>
      <F label="Rubro" name="rubro" error={e.rubro} hint="Ej: gastronomía, indumentaria, artesanías, cosmética…">
        <input id="rubro" name="rubro" list="rubros" required aria-invalid={!!e.rubro} className={field} autoComplete="off" />
        <datalist id="rubros">{rubros.map((r) => <option key={r} value={r} />)}</datalist>
      </F>

      <fieldset className="mb-4">
        <legend className="mb-1.5 text-[15px] font-bold">Puedo llevar a la feria</legend>
        <div className="flex flex-wrap gap-2">
          {LLEVA_OPCIONES.map((o) => (
            <label key={o} className="cursor-pointer">
              <input type="checkbox" name="lleva" value={o} className="peer sr-only" />
              <span className={chip}>{o}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-1.5 text-[15px] font-bold">¿Puede compartir stand?</legend>
        <div className="flex flex-wrap gap-2">
          {[["SI", "Sí"], ["NO", "No"]].map(([v, l]) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name="comparte" value={v} className="peer sr-only" />
              <span className={chip}>{l}</span>
            </label>
          ))}
        </div>
        {e.comparte && <p className="mt-1 text-sm font-semibold text-peligro">{e.comparte}</p>}
      </fieldset>

      <F label="Por favor indíquenos si quiere estar al lado de alguna emprendedora" name="al_lado_de" optional hint="Su nombre o el de su emprendimiento.">
        <input id="al_lado_de" name="al_lado_de" className={field} />
      </F>

      <label className="my-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-fondo p-4 text-[15px]">
        <input type="checkbox" name="consentimiento" required className="mt-0.5 size-5 shrink-0 accent-[#3f742c]" aria-invalid={!!e.consentimiento} />
        <span>
          Acepto que mis datos se usen para gestionar esta inscripción y contactarme por actividades del espacio (
          <Link href="/privacidad" target="_blank" className="underline">aviso de privacidad</Link>).
        </span>
      </label>
      {e.consentimiento && <p className="-mt-3 mb-4 text-sm font-semibold text-peligro">{e.consentimiento}</p>}

      <button type="submit" disabled={pending} className="h-14 w-full rounded-full bg-marca text-[16px] font-extrabold tracking-wide text-white uppercase hover:bg-marca-600 disabled:opacity-60">
        {pending ? "Enviando…" : "Quiero mi lugar en la feria"}
      </button>
    </form>
  );
}
