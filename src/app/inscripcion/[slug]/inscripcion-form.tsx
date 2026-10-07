"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useSubmitWithoutReset } from "@/components/forms";
import { IconAlert, IconCalendar, IconCheck, IconClock, IconPin, IconShare, IconWhatsApp } from "@/components/icons";
import { formatPhone, normalizePhone, titleCase } from "@/lib/format";
import { ORDEN_CAMPOS, OTRO, esCapital, validarInscripcion } from "@/lib/inscripcion-publica";
import type { Pregunta } from "@/lib/preguntas";
import { inscribirAction, type InscripcionState } from "./actions";

/** Datos públicos del taller (para la confirmación, el calendario y compartir). */
export interface TallerInfo {
  nombre: string;
  cuando: string;
  horario: string;
  lugar: string;
  direccion: string;
  calendario: string; // link a Google Calendar ("" si no hay fecha)
}

// Todo grande y cómodo: texto de 17 px (en iPhone, menos de 16 px hace zoom), campos de 56 px de alto.
const field =
  "block w-full h-14 rounded-2xl border-2 border-linea bg-white px-4 text-[17px] text-tinta placeholder:text-gris/80 focus:outline-none focus:border-petroleo aria-[invalid=true]:border-peligro aria-[invalid=true]:bg-peligro-50/40";

function Campo({ label, name, error, ayuda, opcional, children }: { label: string; name: string; error?: string; ayuda?: string; opcional?: boolean; children: ReactNode }) {
  return (
    <div className="mb-5" data-campo={name}>
      <label htmlFor={name} className="mb-1.5 block text-[17px] font-bold text-tinta">
        {label} {opcional ? <span className="font-semibold text-gris">(opcional)</span> : <span className="text-peligro" aria-hidden>*</span>}
      </label>
      {children}
      {ayuda && !error && <p id={`${name}-ayuda`} className="mt-1.5 text-[15px] text-gris">{ayuda}</p>}
      {error && <MensajeError id={`${name}-err`}>{error}</MensajeError>}
    </div>
  );
}

function MensajeError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[15px] font-bold text-peligro">
      <IconAlert size={18} className="mt-0.5 shrink-0" /> {children}
    </p>
  );
}

/** Pregunta Sí/No con dos botones grandes (nada de desplegables). */
function SiNo({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2.5 text-[17px] leading-snug font-bold text-tinta">{label}</legend>
      <div className="grid grid-cols-2 gap-3">
        {(["SI", "NO"] as const).map((v) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="peer sr-only" />
            <span className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-linea bg-white text-[17px] font-extrabold text-tinta peer-checked:border-marca peer-checked:bg-verde-50 peer-checked:text-marca-600 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-petroleo">
              {value === v && <IconCheck size={20} />}
              {v === "SI" ? "Sí" : "No"}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Bloque({ numero, titulo, texto, listo, children }: { numero: number; titulo: string; texto: string; listo: boolean; children: ReactNode }) {
  return (
    <section className="mb-5 rounded-[28px] border border-linea bg-white p-5 shadow-[0_1px_3px_rgba(16,105,133,0.06)] sm:p-7" aria-labelledby={`bloque-${numero}`}>
      <div className="mb-5 flex items-start gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full font-titulo text-lg font-extrabold ${listo ? "bg-marca text-white" : "bg-petroleo-50 text-petroleo-600"}`}
          aria-hidden
        >
          {listo ? <IconCheck size={22} /> : numero}
        </span>
        <div>
          <h2 id={`bloque-${numero}`} className="font-titulo text-[21px] leading-tight font-extrabold text-petroleo-600">{titulo}</h2>
          <p className="mt-1 text-[16px] leading-snug text-gris">{texto}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

type Valores = Record<"nombre" | "apellido" | "dni" | "ciudad" | "ciudad_otra" | "barrio" | "barrio_otro" | "direccion" | "fn_dia" | "fn_mes" | "fn_anio" | "telefono", string>;

export function InscripcionForm({
  slug, token, preguntas, barrios, ciudades, ciudadInicial, escuela, taller, listaEspera = false,
}: {
  /** Cupo completo: el formulario anota en la lista de espera. */
  listaEspera?: boolean;
  slug: string;
  token: string;
  preguntas: { pregunta: Pregunta; indice: number }[];
  barrios: string[];
  ciudades: string[];
  ciudadInicial: string;
  escuela: boolean;
  taller: TallerInfo;
}) {
  const [state, action, pending] = useActionState<InscripcionState, FormData>(inscribirAction.bind(null, slug), { ok: true });
  const onSubmitServidor = useSubmitWithoutReset(action);
  const [v, setV] = useState<Valores>({
    nombre: "", apellido: "", dni: "", ciudad: ciudadInicial, ciudad_otra: "", barrio: "", barrio_otro: "", direccion: "", fn_dia: "", fn_mes: "", fn_anio: "", telefono: "",
  });
  const [consentimiento, setConsentimiento] = useState(false);
  const [r, setR] = useState({ participo_antes: "", quiere_ser_profe: "", ensenaria: "", conoce_espacio: "", espacio: "" });
  const [extra, setExtra] = useState<Record<number, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [intento, setIntento] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const mesRef = useRef<HTMLInputElement>(null);
  const anioRef = useRef<HTMLInputElement>(null);

  const ciudadReal = v.ciudad === OTRO ? v.ciudad_otra : v.ciudad;
  const capital = esCapital(ciudadReal) && v.ciudad !== OTRO;
  const barrioReal = capital ? (v.barrio === OTRO ? v.barrio_otro : v.barrio) : v.barrio_otro;
  const fechaNacimiento = v.fn_dia || v.fn_mes || v.fn_anio ? `${v.fn_dia}/${v.fn_mes}/${v.fn_anio}` : "";
  const datos = { ...v, fecha_nacimiento: fechaNacimiento, ciudad: ciudadReal, barrio: barrioReal, consentimiento };

  const e = errores;

  // Con conexión lenta, la persona puede empezar a escribir antes de que cargue la página: se conserva lo escrito.
  useEffect(() => {
    const f = formRef.current;
    if (!f) return;
    const escrito: Partial<Valores> = {};
    for (const k of ["nombre", "apellido", "dni", "direccion", "fn_dia", "fn_mes", "fn_anio", "telefono"] as const) {
      const el = f.elements.namedItem(k);
      if (el instanceof HTMLInputElement && el.value) escrito[k] = el.value;
    }
    // Una sola vez al cargar: lo escrito en el DOM antes de hidratar es la fuente de verdad.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Object.keys(escrito).length) setV((p) => ({ ...p, ...escrito }));
  }, []);

  // Si el servidor marca algún dato (no debería: valida igual que acá), se muestra en su campo.
  const [vistoServidor, setVistoServidor] = useState(state);
  if (state !== vistoServidor) {
    setVistoServidor(state);
    if (state.fields) {
      setErrores(state.fields);
      setIntento((n) => n + 1);
    }
  }

  // Llevar a la persona al primer dato con problema.
  useEffect(() => {
    if (!intento) return;
    const primero = ORDEN_CAMPOS.find((k) => errores[k]);
    if (!primero) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input:not([type=hidden]), select")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  function set<K extends keyof Valores>(k: K, valor: string) {
    setV((p) => ({ ...p, [k]: valor }));
    const campo = k === "ciudad_otra" ? "ciudad" : k === "barrio_otro" ? "barrio" : k;
    if (errores[campo]) setErrores((p) => ({ ...p, [campo]: "" }));
  }

  function enviar(ev: React.FormEvent<HTMLFormElement>) {
    const errs = Object.fromEntries(Object.entries(validarInscripcion(datos)).filter(([, m]) => m));
    setErrores(errs);
    setIntento((n) => n + 1);
    if (Object.keys(errs).length) {
      ev.preventDefault();
      return;
    }
    onSubmitServidor(ev);
  }

  if (state.ok && state.data && ["inscripto", "ya_inscripto", "en_espera"].includes(state.data.status)) {
    return <Confirmacion taller={taller} nombre={state.data.nombre} yaEstaba={state.data.status === "ya_inscripto"} espera={state.data.status === "en_espera"} escuela={escuela} />;
  }

  const datosListos = ORDEN_CAMPOS.filter((k) => k !== "consentimiento").every((k) => !validarInscripcion(datos)[k]);
  const conocerteListo = escuela ? !!r.participo_antes : preguntas.length > 0 && preguntas.every((q) => extra[q.indice]);
  const escuelaLista = !!r.quiere_ser_profe && !!r.conoce_espacio;
  const pasos = escuela
    ? [{ n: 1, t: "Tus datos", ok: datosListos }, { n: 2, t: "Conocerte", ok: conocerteListo }, { n: 3, t: "Escuela", ok: escuelaLista }]
    : [];
  const telOk = normalizePhone(v.telefono).length === 10;
  const hayErrores = Object.values(e).some(Boolean);

  const preguntasExtra = preguntas.map(({ pregunta: q, indice: i }) =>
    q.opciones ? (
      <fieldset key={i} className="mb-5">
        <legend className="mb-2.5 text-[17px] leading-snug font-bold text-tinta">{q.texto}</legend>
        <div className={q.opciones.length === 2 ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
          {q.opciones.map((o) => (
            <label key={o} className="cursor-pointer">
              <input type="radio" name={`respuesta-${i}`} value={o} checked={extra[i] === o} onChange={() => setExtra((p) => ({ ...p, [i]: o }))} className="peer sr-only" />
              <span className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-linea bg-white px-4 text-center text-[17px] font-bold peer-checked:border-marca peer-checked:bg-verde-50 peer-checked:text-marca-600 peer-focus-visible:outline-3 peer-focus-visible:outline-petroleo">
                {extra[i] === o && <IconCheck size={20} />} {o}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    ) : (
      <div key={i} className="mb-5">
        <label htmlFor={`respuesta-${i}`} className="mb-1.5 block text-[17px] font-bold text-tinta">{q.texto}</label>
        <input id={`respuesta-${i}`} name={`respuesta-${i}`} value={extra[i] ?? ""} onChange={(x) => setExtra((p) => ({ ...p, [i]: x.target.value }))} className={field} />
      </div>
    ),
  );

  return (
    <form ref={formRef} onSubmit={enviar} noValidate>
      <input type="hidden" name="_t" value={token} />
      {/* Campo trampa: invisible para personas */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>No completar<input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {pasos.length > 0 && (
        <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Pasos del formulario">
          {pasos.map((p) => (
            <li key={p.n} className="flex flex-col items-center gap-1.5 text-center">
              <span className={`h-1.5 w-full rounded-full ${p.ok ? "bg-marca" : "bg-linea"}`} aria-hidden />
              <span className={`text-[14px] font-bold ${p.ok ? "text-marca-600" : "text-gris"}`}>
                {p.n}. {p.t}
                <span className="sr-only">{p.ok ? " (completo)" : ""}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <Bloque numero={1} titulo="Tus datos" texto="Así podemos registrar tu lugar y contactarte." listo={datosListos}>
        <Campo label="Nombre" name="nombre" error={e.nombre}>
          <input id="nombre" name="nombre" value={v.nombre} onChange={(x) => set("nombre", x.target.value)} autoComplete="given-name" autoCapitalize="words" aria-invalid={!!e.nombre} aria-describedby={e.nombre ? "nombre-err" : undefined} className={field} />
        </Campo>
        <Campo label="Apellido" name="apellido" error={e.apellido}>
          <input id="apellido" name="apellido" value={v.apellido} onChange={(x) => set("apellido", x.target.value)} autoComplete="family-name" autoCapitalize="words" aria-invalid={!!e.apellido} aria-describedby={e.apellido ? "apellido-err" : undefined} className={field} />
        </Campo>
        <Campo label="DNI" name="dni" error={e.dni} ayuda="Escribilo sin puntos.">
          <input
            id="dni" name="dni" value={v.dni} onChange={(x) => set("dni", x.target.value.replace(/[^\d]/g, "").slice(0, 9))}
            inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="Ej: 30123456"
            aria-invalid={!!e.dni} aria-describedby={e.dni ? "dni-err" : "dni-ayuda"} className={field}
          />
        </Campo>

        <Campo label="Ciudad o localidad" name="ciudad" error={e.ciudad}>
          <select id="ciudad" name="ciudad" value={v.ciudad} onChange={(x) => { set("ciudad", x.target.value); set("barrio", ""); }} aria-invalid={!!e.ciudad} className={field}>
            {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={OTRO}>Otra localidad</option>
          </select>
          {v.ciudad === OTRO && (
            <input name="ciudad_otra" value={v.ciudad_otra} onChange={(x) => set("ciudad_otra", x.target.value)} placeholder="Escribí tu localidad" aria-label="Nombre de tu localidad" aria-invalid={!!e.ciudad} className={`${field} mt-3`} autoFocus />
          )}
        </Campo>

        {/* En el interior el barrio es opcional. */}
        <Campo label="Barrio" name="barrio" error={e.barrio} opcional={!capital}>
          {capital && barrios.length > 0 ? (
            <>
              <select id="barrio" name="barrio" value={v.barrio} onChange={(x) => set("barrio", x.target.value)} aria-invalid={!!e.barrio} className={field}>
                <option value="" disabled>Elegí tu barrio</option>
                {barrios.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
                <option value={OTRO}>Otro / No encuentro mi barrio</option>
              </select>
              {v.barrio === OTRO && (
                <input name="barrio_otro" value={v.barrio_otro} onChange={(x) => set("barrio_otro", x.target.value)} placeholder="Escribí el nombre de tu barrio" aria-label="Nombre de tu barrio" aria-invalid={!!e.barrio} className={`${field} mt-3`} autoFocus />
              )}
            </>
          ) : (
            <input id="barrio" name="barrio_otro" value={v.barrio_otro} onChange={(x) => set("barrio_otro", x.target.value)} aria-invalid={!!e.barrio} className={field} />
          )}
          {capital && barrios.length > 0 && v.barrio !== OTRO && <input type="hidden" name="barrio_otro" value="" />}
          {!(capital && barrios.length > 0) && <input type="hidden" name="barrio" value={OTRO} />}
        </Campo>

        <Campo label="Dirección" name="direccion" error={e.direccion}>
          <input id="direccion" name="direccion" value={v.direccion} onChange={(x) => set("direccion", x.target.value)} autoComplete="street-address" placeholder="Calle y altura, o manzana y casa" aria-invalid={!!e.direccion} className={field} />
        </Campo>

        {/* Fecha de nacimiento: tres casillas con números (lo más fácil para personas grandes, sin calendario ni barras). */}
        <fieldset className="mb-5" data-campo="fecha_nacimiento" aria-describedby={e.fecha_nacimiento ? "fecha_nacimiento-err" : "fecha_nacimiento-ayuda"}>
          <legend className="mb-1.5 block text-[17px] font-bold text-tinta">
            Fecha de nacimiento <span className="text-peligro" aria-hidden>*</span>
          </legend>
          <input type="hidden" name="fecha_nacimiento" value={fechaNacimiento} />
          <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-2.5">
            {([
              ["fn_dia", "Día", "15", 2, "bday-day", mesRef],
              ["fn_mes", "Mes", "08", 2, "bday-month", anioRef],
              ["fn_anio", "Año", "1965", 4, "bday-year", null],
            ] as const).map(([k, label, ej, max, ac, siguiente], idx) => (
              <div key={k}>
                <label htmlFor={idx === 0 ? "fecha_nacimiento" : k} className="mb-1 block text-center text-[16px] font-semibold text-gris">{label}</label>
                <input
                  id={idx === 0 ? "fecha_nacimiento" : k}
                  ref={k === "fn_mes" ? mesRef : k === "fn_anio" ? anioRef : undefined}
                  name={k}
                  value={v[k]}
                  onChange={(x) => {
                    const d = x.target.value.replace(/\D/g, "").slice(0, max);
                    set(k, d);
                    if (errores.fecha_nacimiento) setErrores((p) => ({ ...p, fecha_nacimiento: "" }));
                    // Al completar día o mes, pasa sola a la casilla siguiente.
                    if (d.length === max && siguiente) siguiente.current?.focus();
                  }}
                  inputMode="numeric" pattern="[0-9]*" autoComplete={ac} placeholder={ej} maxLength={max}
                  aria-invalid={!!e.fecha_nacimiento}
                  className={`${field} px-2 text-center text-[19px] font-bold tracking-wider`}
                />
              </div>
            ))}
          </div>
          {!e.fecha_nacimiento && <p id="fecha_nacimiento-ayuda" className="mt-1.5 text-[15px] text-gris">Por ejemplo: 15 / 08 / 1965</p>}
          {e.fecha_nacimiento && <MensajeError id="fecha_nacimiento-err">{e.fecha_nacimiento}</MensajeError>}
        </fieldset>

        <Campo label="Número de WhatsApp" name="telefono" error={e.telefono} ayuda="Con la característica, sin 0 ni 15.">
          <input
            id="telefono" name="telefono" type="tel" inputMode="tel" autoComplete="tel-national" value={v.telefono} onChange={(x) => set("telefono", x.target.value)}
            placeholder="Ej: 379 4123456" aria-invalid={!!e.telefono} aria-describedby={e.telefono ? "telefono-err" : "telefono-ayuda"} className={field}
          />
        </Campo>
      </Bloque>

      {escuela ? (
        <>
          <Bloque numero={2} titulo="Queremos conocerte" texto="Son preguntas cortitas. Nos ayudan a armar mejores talleres." listo={conocerteListo}>
            <SiNo name="participo_antes" label="¿Participaste alguna vez de nuestras actividades?" value={r.participo_antes} onChange={(x) => setR((p) => ({ ...p, participo_antes: x }))} />
            {preguntasExtra}
          </Bloque>

          <Bloque numero={3} titulo="Sumate a la escuela" texto="También queremos conocer tus ideas y descubrir nuevos espacios para seguir haciendo talleres." listo={escuelaLista}>
            <SiNo name="quiere_ser_profe" label="¿Te gustaría ser profe de nuestra escuela?" value={r.quiere_ser_profe} onChange={(x) => setR((p) => ({ ...p, quiere_ser_profe: x }))} />
            {r.quiere_ser_profe === "SI" && (
              <div className="-mt-1 mb-6 rounded-2xl bg-verde-50 p-4">
                <label htmlFor="ensenaria" className="mb-1.5 block text-[17px] font-bold text-tinta">¿Qué te gustaría enseñar?</label>
                <input id="ensenaria" name="ensenaria" value={r.ensenaria} onChange={(x) => setR((p) => ({ ...p, ensenaria: x.target.value }))} placeholder="Costura, cocina, manualidades, belleza, algún oficio…" className={field} maxLength={500} />
              </div>
            )}
            <SiNo name="conoce_espacio" label="¿Conocés algún lugar o espacio donde podamos hacer nuestros talleres?" value={r.conoce_espacio} onChange={(x) => setR((p) => ({ ...p, conoce_espacio: x }))} />
            {r.conoce_espacio === "SI" && (
              <div className="-mt-1 rounded-2xl bg-verde-50 p-4">
                <label htmlFor="espacio" className="block text-[17px] font-bold text-tinta">¡Contanos un poquito más sobre el lugar!</label>
                <p className="mt-1 mb-2 text-[15px] text-gris">Puede ser una casa, salón, patio, club, institución u otro espacio.</p>
                <textarea id="espacio" name="espacio" rows={3} value={r.espacio} onChange={(x) => setR((p) => ({ ...p, espacio: x.target.value }))} maxLength={500} className={`${field} h-auto py-3 leading-snug`} placeholder="Dónde queda y cómo es" />
                <p className="mt-2 text-[15px] text-gris">Si nos sirve para futuras actividades, nos ponemos en contacto con vos.</p>
              </div>
            )}
          </Bloque>
        </>
      ) : (
        preguntas.length > 0 && (
          <Bloque numero={2} titulo="Unas preguntas más" texto="Son cortitas." listo={conocerteListo}>
            {preguntasExtra}
          </Bloque>
        )
      )}

      <section className="rounded-[28px] border border-linea bg-white p-5 shadow-[0_1px_3px_rgba(16,105,133,0.06)] sm:p-7">
        <div data-campo="consentimiento">
          <label className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border-2 p-4 ${e.consentimiento ? "border-peligro bg-peligro-50/40" : consentimiento ? "border-marca bg-verde-50" : "border-linea bg-fondo"}`}>
            <input
              type="checkbox" name="consentimiento" checked={consentimiento}
              onChange={(x) => { setConsentimiento(x.target.checked); if (errores.consentimiento) setErrores((p) => ({ ...p, consentimiento: "" })); }}
              className="mt-0.5 size-7 shrink-0 cursor-pointer accent-[#3f742c]" aria-invalid={!!e.consentimiento}
            />
            <span className="text-[16px] leading-snug text-tinta">
              Acepto que mis datos sean usados para gestionar mi inscripción y contactarme por actividades de la Escuela.
            </span>
          </label>
          {e.consentimiento && <MensajeError>{e.consentimiento}</MensajeError>}
          <Link href="/privacidad" target="_blank" className="mt-2 inline-flex min-h-11 items-center px-1 text-[16px] font-bold text-petroleo underline underline-offset-4">
            Ver aviso de privacidad
          </Link>
        </div>

        <p className="mt-4 mb-4 flex items-start gap-2 rounded-2xl bg-petroleo-50 p-4 text-[16px] leading-snug text-petroleo-600">
          <IconWhatsApp size={22} className="mt-0.5 shrink-0" />
          <span>
            {telOk ? <>Te vamos a escribir al <b className="whitespace-nowrap">{formatPhone(v.telefono)}</b>. Revisá que esté bien.</> : "Revisá que tu número de WhatsApp esté correcto para poder contactarte."}
          </span>
        </p>

        {(hayErrores || state.message) && (
          <div role="alert" className="mb-4 rounded-2xl bg-peligro-50 px-4 py-3 text-[16px] font-bold text-peligro">
            {hayErrores ? "Nos falta algún dato. Revisá lo marcado en rojo." : state.message}
          </div>
        )}

        <button type="submit" disabled={pending} className="h-16 w-full rounded-full bg-marca font-titulo text-[18px] font-extrabold tracking-wide text-white uppercase shadow-[0_6px_16px_rgba(63,116,44,0.28)] hover:bg-marca-600 active:translate-y-px disabled:opacity-60">
          {pending ? "Enviando…" : listaEspera ? "Anotarme en lista de espera" : "Quiero inscribirme"}
        </button>
      </section>
    </form>
  );
}

/** Pantalla final: queda claro que está inscripta, cuándo y dónde. */
function Confirmacion({ taller, nombre, yaEstaba, espera = false, escuela }: { taller: TallerInfo; nombre: string; yaEstaba: boolean; espera?: boolean; escuela: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function compartir() {
    const url = window.location.href.split("#")[0];
    const texto = `¡Sumate ${escuela ? "al taller " : "a "}${taller.nombre}! ${taller.cuando}${taller.horario ? `, ${taller.horario}` : ""}. Inscribite acá:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: taller.nombre, text: texto, url });
        return;
      } catch {
        return; // canceló
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, "_blank", "noopener");
  }

  return (
    <div ref={ref} role="status" className="scroll-mt-4 rounded-[28px] border border-linea bg-white p-6 text-center shadow-[0_1px_3px_rgba(16,105,133,0.06)] sm:p-8">
      <span className={`mx-auto flex size-16 items-center justify-center rounded-full text-white ${espera ? "bg-alerta" : "bg-marca"}`} aria-hidden>
        {espera ? <IconClock size={34} strokeWidth={2.4} /> : <IconCheck size={36} strokeWidth={2.6} />}
      </span>
      <p className={`mt-4 font-titulo text-[30px] leading-tight font-black ${espera ? "text-alerta" : "text-marca-600"}`}>
        {espera ? "Quedaste en lista de espera" : yaEstaba ? "¡Ya tenés tu lugar!" : `¡Listo${nombre ? `, ${nombre}` : ""}!`}
      </p>
      <p className="mt-2 text-[17px] leading-snug text-tinta">
        {espera
          ? "Se completó el cupo. Si se libera un lugar, te avisamos por WhatsApp."
          : yaEstaba
            ? "Ya encontramos una inscripción con este DNI para este taller. No hace falta que te anotes de nuevo."
            : "Tu inscripción quedó registrada."}
      </p>

      <div className="mt-5 rounded-2xl bg-fondo p-4 text-left">
        <p className="font-titulo text-[20px] leading-tight font-extrabold text-petroleo-600">{taller.nombre}</p>
        <ul className="mt-3 space-y-2 text-[16px]">
          <li className="flex items-start gap-2.5"><IconCalendar size={20} className="mt-0.5 shrink-0 text-petroleo" /><span className="font-bold first-letter:uppercase">{taller.cuando}</span></li>
          {taller.horario && <li className="flex items-start gap-2.5"><IconClock size={20} className="mt-0.5 shrink-0 text-petroleo" /><span className="font-bold">{taller.horario}</span></li>}
          {(taller.lugar || taller.direccion) && (
            <li className="flex items-start gap-2.5">
              <IconPin size={20} className="mt-0.5 shrink-0 text-petroleo" />
              <span><b>{taller.lugar}</b>{taller.lugar && taller.direccion && <br />}{taller.direccion}</span>
            </li>
          )}
        </ul>
      </div>

      {!espera && <p className="mt-5 text-[18px] font-extrabold text-marca-600">¡Te esperamos!</p>}

      <div className="mt-5 grid gap-3">
        {taller.calendario && !espera && (
          <a href={taller.calendario} target="_blank" rel="noopener noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-full bg-marca px-5 text-[17px] font-extrabold text-white hover:bg-marca-600">
            <IconCalendar size={22} /> Agregar al calendario
          </a>
        )}
        <button type="button" onClick={compartir} className="flex h-14 items-center justify-center gap-2 rounded-full border-2 border-petroleo bg-white px-5 text-[17px] font-extrabold text-petroleo hover:bg-petroleo-50">
          <IconShare size={22} /> {escuela ? "Compartir el taller" : "Compartir"}
        </button>
      </div>
    </div>
  );
}
