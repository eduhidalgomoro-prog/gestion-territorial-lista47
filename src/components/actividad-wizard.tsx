"use client";

import { useActionState, useMemo, useState, useTransition, type ReactNode } from "react";
import { geocodeAction } from "@/app/(panel)/actions";
import type { ActionResult } from "@/lib/errors";
import { formatMoney, titleCase } from "@/lib/format";
import { zonaLabel } from "@/lib/labels";
import { ambitoDe, SIN_REGION } from "@/lib/territorio";

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
import type { ActividadInput, InsumoInput } from "@/lib/services/actividades";
import { esTallerEscuela } from "@/lib/inscripcion-publica";
import { ESTADOS_FLYER } from "@/lib/schema";
import { IconArrowLeft, IconArrowRight, IconCheck, IconPin, IconPlus, IconTarget, IconX } from "./icons";
import { SelectorUbicacion } from "./mapa";
import { btn, cx } from "./ui";

export interface WizardOpciones {
  zonas: string[]; // si hay una sola, la zona queda fija (responsable)
  regiones: { nombre: string; localidades: string[] }[]; // interior
  barrios: { barrio: string; zona: string }[];
  tipos: string[];
  publicos: string[];
  tiposArticulacion: string[];
  mesas: string[];
  instituciones: { id: string; nombre: string; tipo: string }[];
  tiposInsumo: string[];
  lugares: string[];
  responsables: string[];
  estados: string[]; // estados elegibles en este formulario
  gestionaFlyer: boolean; // puede elegir estado y link del flyer (admin / diseño)
}

const PASOS = ["Información general", "Fecha y ubicación", "Articulación y público", "Logística", "Comunicación e inscripción", "Confirmación"];

/** Campos que pertenecen a cada paso (para volver al paso con error). */
const CAMPOS_PASO: Record<string, number> = {
  nombre: 0, detalle: 0, responsable: 0, zona: 0, localidad: 0, tipo: 0, estado: 0,
  fecha: 1, hora_inicio: 1, hora_fin: 1, fecha_alt: 1, hora_alt: 1, barrio: 1, direccion: 1,
};

const inputCls =
  "block w-full min-h-12 rounded-xl border border-linea bg-white px-3.5 py-2.5 text-tinta placeholder:text-gris/60 focus:border-petroleo focus:outline-none aria-[invalid=true]:border-peligro";

function Campo({ label, error, children, optional, hint, htmlFor }: { label: string; error?: string; children: ReactNode; optional?: boolean; hint?: string; htmlFor?: string }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[15px] font-bold text-tinta">
        {label} {optional && <span className="font-normal text-gris">(opcional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-gris">{hint}</p>}
      {error && <p className="mt-1 text-sm font-semibold text-peligro">{error}</p>}
    </div>
  );
}

function Chips({ value, options, onChange, label }: { value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx(
            "inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold",
            value === v ? "border-marca bg-verde-50 text-marca-600" : "border-linea bg-white text-tinta hover:border-petroleo",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function SiNo({ label, value, onChange, children }: { label: string; value: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl border border-linea bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-bold">{label}</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-fondo p-1" role="radiogroup" aria-label={label}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={value === v}
              onClick={() => onChange(v)}
              className={cx("min-h-10 min-w-16 rounded-lg px-3 text-sm font-bold", value === v ? (v ? "bg-marca text-white" : "bg-white text-tinta shadow-sm") : "text-gris")}
            >
              {v ? "SÍ" : "NO"}
            </button>
          ))}
        </div>
      </div>
      {value && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function ActividadWizard({
  inicial,
  opciones,
  action,
  pasoInicial = 0,
  esEdicion,
}: {
  inicial: ActividadInput;
  opciones: WizardOpciones;
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  pasoInicial?: number;
  esEdicion: boolean;
}) {
  const [d, setD] = useState<ActividadInput>(inicial);
  const [paso, setPaso] = useState(Math.min(Math.max(pasoInicial, 0), PASOS.length - 1));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [autoCosto, setAutoCosto] = useState(inicial.costo_estimado === null);
  const [barrioNuevo, setBarrioNuevo] = useState(!!inicial.barrio && !opciones.barrios.some((b) => b.barrio === inicial.barrio));
  const [instNueva, setInstNueva] = useState(false);
  const [altVisible, setAltVisible] = useState(!!(inicial.fecha_alt || inicial.hora_alt));
  const [geo, setGeo] = useState<{ msg: string; tono: "ok" | "alerta" } | null>(null);
  const [buscando, startGeo] = useTransition();
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (!r.ok && r.fields) {
      setErrores(r.fields);
      const primero = Object.keys(r.fields).map((k) => CAMPOS_PASO[k]).filter((n) => n !== undefined).sort()[0];
      if (primero !== undefined) setPaso(primero);
    }
    return r;
  }, { ok: true });

  const set = <K extends keyof ActividadInput>(k: K, v: ActividadInput[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    if (errores[k as string]) setErrores((e) => ({ ...e, [k as string]: "" }));
  };

  const zonaFija = opciones.zonas.length === 1;
  const interior = !!d.zona && ambitoDe(d.zona) === "interior";
  const zonasCapital = opciones.zonas.filter((z) => ambitoDe(z) === "capital");
  const zonasInterior = opciones.zonas.filter((z) => ambitoDe(z) === "interior");
  // Sugerencias de localidad: todas las de la provincia (o las de su región, si la zona es fija).
  const sugerencias = [...new Set(opciones.regiones.filter((r) => !zonaFija || r.nombre === d.zona).flatMap((r) => r.localidades))].sort();
  const regionDe = (loc: string) => {
    const n = normalizar(loc);
    return n ? opciones.regiones.find((r) => r.nombre !== SIN_REGION && r.localidades.some((l) => normalizar(l) === n))?.nombre ?? "" : "";
  };
  function elegirZona(z: string) {
    // Entre Capital e interior se limpian localidad y barrio; entre regiones del interior se conserva la localidad.
    setD((p) => {
      if (p.zona === z) return p;
      const mismoAmbito = ambitoDe(z) === ambitoDe(p.zona) && !!p.zona;
      return { ...p, zona: z, localidad: mismoAmbito ? p.localidad : "", barrio: mismoAmbito ? p.barrio : "" };
    });
    setBarrioNuevo(false);
    setRegionAuto(false);
    setErrores((e) => ({ ...e, zona: "", localidad: "" }));
  }
  // true si la región la puso la app según la localidad (y no la eligió la persona).
  const [regionAuto, setRegionAuto] = useState(false);
  function elegirLocalidad(v: string) {
    // Si la localidad es de una región, la región se elige sola.
    const r = zonaFija ? "" : regionDe(v);
    const sinZona = !d.zona || (regionAuto && !r);
    setD((p) => ({ ...p, localidad: v, zona: r || (sinZona && v.trim() ? SIN_REGION : sinZona ? "" : p.zona) }));
    setRegionAuto(!!r || (regionAuto && !r && sinZona));
    setErrores((e) => ({ ...e, localidad: "" }));
  }
  const barriosZona = useMemo(
    () => opciones.barrios.filter((b) => !d.zona || d.zona === "GENERAL" || b.zona === d.zona).map((b) => b.barrio).sort(),
    [opciones.barrios, d.zona],
  );
  const sumaInsumos = d.insumos.reduce((s, i) => s + (Number(i.costo) || 0), 0);
  const costoEstimado = autoCosto ? sumaInsumos : d.costo_estimado ?? 0;
  const borrador = d.estado === "BORRADOR";

  function validarPaso(p: number): boolean {
    const e: Record<string, string> = {};
    if (p === 0) {
      if (!d.nombre.trim()) e.nombre = "Poné un nombre a la actividad.";
      if (!borrador && !d.responsable.trim()) e.responsable = "Indicá quién es responsable.";
      if (!borrador && !d.zona) e.zona = "Elegí la zona o región.";
      if (!borrador && interior && !d.localidad.trim()) e.localidad = "Elegí la localidad.";
    }
    if (p === 1 && !borrador) {
      if (!d.fecha) e.fecha = "Elegí la fecha programada.";
      if (d.hora_inicio && d.hora_fin && d.hora_fin <= d.hora_inicio) e.hora_fin = "Tiene que ser después del inicio.";
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  function ir(p: number) {
    if (p > paso) {
      for (let i = paso; i < p; i++) {
        if (!validarPaso(i)) {
          setPaso(i);
          return;
        }
      }
    }
    setPaso(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ubicar() {
    setGeo(null);
    startGeo(async () => {
      const r = await geocodeAction([d.direccion, d.entre_calles && !/\d/.test(d.direccion) ? `y ${d.entre_calles.split(/\s+y\s+/i)[0]}` : ""].join(" ").trim(), d.barrio, interior ? d.localidad : "");
      if (!r) {
        setGeo({ msg: "No encontramos la dirección. Mové el marcador o tocá el mapa en el lugar exacto.", tono: "alerta" });
        return;
      }
      setD((p) => ({ ...p, lat: r.lat, lng: r.lng }));
      setGeo({
        msg: r.aproximado
          ? `Ubicación aproximada (${interior ? "centro de la localidad, del barrio o de la calle" : "centro del barrio o calle"}). Ajustá el marcador al lugar exacto.`
          : "¡Listo! Revisá que el marcador esté en el lugar correcto.",
        tono: r.aproximado ? "alerta" : "ok",
      });
    });
  }

  function miUbicacion() {
    if (!navigator.geolocation) return setGeo({ msg: "Tu dispositivo no permite obtener la ubicación.", tono: "alerta" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setD((p) => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setGeo({ msg: "Usamos tu ubicación actual. Ajustá el marcador si hace falta.", tono: "ok" });
      },
      () => setGeo({ msg: "No pudimos obtener tu ubicación (revisá el permiso del navegador).", tono: "alerta" }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const setInsumo = (i: number, patch: Partial<InsumoInput>) => set("insumos", d.insumos.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const payload = JSON.stringify({ ...d, costo_estimado: autoCosto ? null : d.costo_estimado ?? 0 });

  return (
    <div>
      {/* Indicador de pasos */}
      <ol className="mb-5 flex gap-1.5" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p} className="flex-1">
            <button
              type="button"
              onClick={() => ir(i)}
              className={cx("block h-2 w-full rounded-full", i < paso ? "bg-verde" : i === paso ? "bg-petroleo" : "bg-linea")}
              aria-label={`Paso ${i + 1}: ${p}`}
              aria-current={i === paso ? "step" : undefined}
            />
          </li>
        ))}
      </ol>
      <p className="text-xs font-bold tracking-[0.15em] text-marca uppercase">Paso {paso + 1} de {PASOS.length}</p>
      <h2 className="mb-4 text-xl font-extrabold">{PASOS[paso]}</h2>

      {!state.ok && state.message && (
        <div role="alert" className="mb-4 rounded-xl bg-peligro-50 px-4 py-3 text-[15px] text-peligro">{state.message}</div>
      )}

      {/* PASO 1 */}
      {paso === 0 && (
        <div>
          <Campo label="Nombre de la actividad" error={errores.nombre} htmlFor="nombre">
            <input id="nombre" className={inputCls} value={d.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: Taller de Fieltro" aria-invalid={!!errores.nombre} maxLength={150} />
          </Campo>
          <Campo label="Detalle / descripción" optional htmlFor="detalle">
            <textarea id="detalle" rows={3} className={inputCls} value={d.detalle} onChange={(e) => set("detalle", e.target.value)} placeholder="¿De qué se trata? ¿Qué se va a hacer?" maxLength={2000} />
          </Campo>
          <Campo label="Nombre y apellido del responsable" error={errores.responsable} htmlFor="responsable">
            <input id="responsable" list="responsables" className={inputCls} value={d.responsable} onChange={(e) => set("responsable", e.target.value)} aria-invalid={!!errores.responsable} autoComplete="off" />
            <datalist id="responsables">{opciones.responsables.map((r) => <option key={r} value={r} />)}</datalist>
          </Campo>
          <Campo label={zonasInterior.length ? "Zona o región" : "Zona"} error={errores.zona}>
            {zonaFija ? (
              <p className="rounded-xl bg-fondo px-4 py-3 font-bold">{zonaLabel(opciones.zonas[0])}</p>
            ) : zonasInterior.length ? (
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wide text-gris uppercase">Capital</p>
                  <Chips label="Zona de Capital" value={d.zona} onChange={elegirZona} options={zonasCapital.map((z) => [z, zonaLabel(z)] as const)} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wide text-gris uppercase">Interior</p>
                  <Chips label="Región del interior" value={d.zona} onChange={elegirZona} options={zonasInterior.map((z) => [z, zonaLabel(z)] as const)} />
                </div>
              </div>
            ) : (
              <Chips label="Zona" value={d.zona} onChange={elegirZona} options={opciones.zonas.map((z) => [z, zonaLabel(z)] as const)} />
            )}
          </Campo>
          {/* Sin zona elegida todavía, también se puede empezar por la localidad: la región se completa sola. */}
          {(interior || (!d.zona && !zonaFija && zonasInterior.length > 0)) && (
            <Campo
              label={interior ? "Localidad" : "Localidad (si es en el interior)"}
              optional={!interior}
              error={errores.localidad}
              htmlFor="localidad"
              hint={
                !d.localidad.trim()
                  ? "Escribila o elegila de la lista. Puede ser cualquier localidad de la provincia."
                  : zonaFija || d.zona !== SIN_REGION
                    ? `${zonaLabel(d.zona)}.`
                    : "No está en ninguna región: queda como «Interior (sin región)». Si corresponde a una, elegila arriba."
              }
            >
              <input
                id="localidad"
                list="localidades"
                className={inputCls}
                value={d.localidad}
                onChange={(e) => elegirLocalidad(e.target.value)}
                placeholder="Ej: Santa Lucía"
                aria-invalid={!!errores.localidad}
                autoComplete="off"
              />
              <datalist id="localidades">{sugerencias.map((l) => <option key={l} value={l} />)}</datalist>
            </Campo>
          )}
          <Campo label="Tipo / programa de actividad" optional htmlFor="tipo">
            <select id="tipo" className={inputCls} value={d.tipo} onChange={(e) => set("tipo", e.target.value)}>
              <option value="">Elegí…</option>
              {[...new Set([...opciones.tipos, d.tipo].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Estado" hint="Borrador: todavía no está confirmada la idea (no suma al objetivo de la zona).">
            <Chips label="Estado" value={d.estado} onChange={(v) => set("estado", v)} options={opciones.estados.map((e) => [e, e] as const)} />
          </Campo>
        </div>
      )}

      {/* PASO 2 */}
      {paso === 1 && (
        <div>
          <div className="grid gap-x-3 sm:grid-cols-3">
            <Campo label="Fecha programada" error={errores.fecha} htmlFor="fecha">
              <input id="fecha" type="date" className={inputCls} value={d.fecha} onChange={(e) => set("fecha", e.target.value)} aria-invalid={!!errores.fecha} />
            </Campo>
            <Campo label="Hora de inicio" error={errores.hora_inicio} optional htmlFor="hi">
              <input id="hi" type="time" className={inputCls} value={d.hora_inicio} onChange={(e) => set("hora_inicio", e.target.value)} />
            </Campo>
            <Campo label="Hora de finalización" error={errores.hora_fin} optional htmlFor="hf">
              <input id="hf" type="time" className={inputCls} value={d.hora_fin} onChange={(e) => set("hora_fin", e.target.value)} aria-invalid={!!errores.hora_fin} />
            </Campo>
          </div>
          {altVisible ? (
            <div className="grid gap-x-3 sm:grid-cols-3">
              <Campo label="Fecha alternativa" optional error={errores.fecha_alt} htmlFor="fa">
                <input id="fa" type="date" className={inputCls} value={d.fecha_alt} onChange={(e) => set("fecha_alt", e.target.value)} />
              </Campo>
              <Campo label="Horario alternativo" optional error={errores.hora_alt} htmlFor="ha">
                <input id="ha" type="time" className={inputCls} value={d.hora_alt} onChange={(e) => set("hora_alt", e.target.value)} />
              </Campo>
            </div>
          ) : (
            <button type="button" onClick={() => setAltVisible(true)} className="mb-4 block text-sm font-bold text-petroleo hover:underline">
              + Agregar fecha alternativa (por lluvia u otro motivo)
            </button>
          )}

          {/* Talleres de varias clases: cada clase tiene su propia asistencia. */}
          <div className="mb-4 rounded-xl bg-fondo p-3">
            <p className="text-sm font-bold">¿Es un taller de varias clases?</p>
            <p className="mb-2 text-sm text-gris">
              {(d.clases_extra ?? []).length
                ? `${(d.clases_extra ?? []).length + 1} clases: la primera es la fecha programada. En «Tomar asistencia» se elige la clase.`
                : "Agregá las fechas de las clases siguientes (la primera es la fecha programada)."}
            </p>
            {(d.clases_extra ?? []).map((f, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <span className="w-16 shrink-0 text-sm font-semibold text-gris">Clase {i + 2}</span>
                <input
                  type="date"
                  aria-label={`Fecha de la clase ${i + 2}`}
                  className={inputCls}
                  value={f}
                  min={d.fecha || undefined}
                  onChange={(e) => set("clases_extra", (d.clases_extra ?? []).map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button
                  type="button"
                  onClick={() => set("clases_extra", (d.clases_extra ?? []).filter((_, j) => j !== i))}
                  className="shrink-0 rounded-lg px-2 py-2 text-sm font-bold text-gris hover:text-peligro"
                  aria-label={`Quitar la clase ${i + 2}`}
                >
                  Quitar
                </button>
              </div>
            ))}
            {errores.clases_extra && <p className="mb-2 text-sm font-semibold text-peligro">{errores.clases_extra}</p>}
            <button
              type="button"
              onClick={() => {
                const lista = d.clases_extra ?? [];
                // Propone el mismo día de la semana siguiente a la última clase.
                const base = lista[lista.length - 1] || d.fecha;
                const sig = base ? new Date(Date.parse(`${base}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10) : "";
                set("clases_extra", [...lista, sig]);
              }}
              className="text-sm font-bold text-petroleo hover:underline"
            >
              + Agregar otra clase
            </button>
          </div>

          <div className="my-2 h-px bg-linea" />

          <Campo label="Barrio" htmlFor="barrio" optional={interior} hint={interior ? (d.localidad ? `Barrio de ${d.localidad}` : undefined) : d.zona && d.zona !== "GENERAL" ? `Barrios de la ${zonaLabel(d.zona)}` : undefined}>
            {interior ? (
              <input id="barrio" className={inputCls} value={d.barrio} onChange={(e) => set("barrio", e.target.value.toUpperCase())} placeholder="Nombre del barrio" autoComplete="off" />
            ) : barrioNuevo ? (
              <div className="flex gap-2">
                <input id="barrio" className={inputCls} value={d.barrio} onChange={(e) => set("barrio", e.target.value.toUpperCase())} placeholder="Nombre del barrio" />
                <button type="button" onClick={() => { setBarrioNuevo(false); set("barrio", ""); }} className={btn("secundario")}>Lista</button>
              </div>
            ) : (
              <select
                id="barrio"
                className={inputCls}
                value={d.barrio}
                onChange={(e) => {
                  if (e.target.value === "__nuevo") {
                    setBarrioNuevo(true);
                    set("barrio", "");
                  } else set("barrio", e.target.value);
                }}
              >
                <option value="">Elegí el barrio…</option>
                {[...new Set([...barriosZona, d.barrio].filter(Boolean))].map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
                <option value="__nuevo">+ Otro barrio (no está en la lista)</option>
              </select>
            )}
          </Campo>
          <Campo label="Dirección (calle y altura)" optional htmlFor="dir">
            <input id="dir" className={inputCls} value={d.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Ej: General Paz 283" autoComplete="off" />
          </Campo>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Campo label="Entre qué calle y qué calle" optional htmlFor="entre">
              <input id="entre" className={inputCls} value={d.entre_calles} onChange={(e) => set("entre_calles", e.target.value)} placeholder="Ej: Elías Abad y Pago Largo" />
            </Campo>
            <Campo label="Lugar específico" optional htmlFor="lugar">
              <input id="lugar" list="lugares" className={inputCls} value={d.lugar} onChange={(e) => set("lugar", e.target.value)} placeholder="Ej: Casa de vecino/a, Plaza, Club…" autoComplete="off" />
              <datalist id="lugares">{opciones.lugares.map((l) => <option key={l} value={l} />)}</datalist>
            </Campo>
          </div>

          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" onClick={ubicar} disabled={buscando || (!d.direccion && !d.barrio && !(interior && d.localidad))} className={btn("petroleo")}>
              <IconPin size={20} /> {buscando ? "Buscando…" : "Ubicar en el mapa"}
            </button>
            <button type="button" onClick={miUbicacion} className={btn("secundario")}>
              <IconTarget size={20} /> Usar mi ubicación
            </button>
          </div>
          {geo && <p className={cx("mb-2 rounded-xl px-3 py-2 text-sm font-semibold", geo.tono === "ok" ? "bg-ok-50 text-ok" : "bg-alerta-50 text-alerta")}>{geo.msg}</p>}
          <SelectorUbicacion lat={d.lat} lng={d.lng} provincia={interior} onChange={(lat, lng) => setD((p) => ({ ...p, lat, lng }))} />
          <p className="mt-1.5 text-sm text-gris">
            {d.lat && d.lng ? `Ubicación guardada: ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}. ` : "Todavía sin ubicación. "}
            Podés mover el marcador o tocar el mapa para corregirla.
            {d.lat !== 0 && (
              <button type="button" className="ml-2 font-bold text-peligro hover:underline" onClick={() => setD((p) => ({ ...p, lat: 0, lng: 0 }))}>Quitar</button>
            )}
          </p>
        </div>
      )}

      {/* PASO 3 */}
      {paso === 2 && (
        <div>
          <Campo label="Público al que está dirigida">
            <Chips label="Público" value={d.publico} onChange={(v) => set("publico", v)} options={[...new Set([...opciones.publicos, d.publico].filter(Boolean))].map((p) => [p, titleCase(p)] as const)} />
          </Campo>
          <SiNo label="¿Trabajará en conjunto con otra mesa o institución externa?" value={d.articula} onChange={(v) => set("articula", v)}>
            <Campo label="Tipo de articulación" htmlFor="tart">
              <select id="tart" className={inputCls} value={d.tipo_articulacion} onChange={(e) => set("tipo_articulacion", e.target.value)}>
                <option value="">Elegí…</option>
                {[...new Set([...opciones.tiposArticulacion, d.tipo_articulacion].filter(Boolean))].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Campo>
            <Campo label="Mesa / institución" optional htmlFor="mesa" hint="Si articula con una mesa interna (ESME, Marcando Huellas, Deportes…).">
              <select id="mesa" className={inputCls} value={d.mesa} onChange={(e) => set("mesa", e.target.value)}>
                <option value="">Ninguna</option>
                {[...new Set([...opciones.mesas, d.mesa].filter(Boolean))].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
              </select>
            </Campo>
            <Campo label="Nombre de la institución" optional htmlFor="inst">
              {instNueva ? (
                <div className="space-y-2">
                  <input id="inst" className={inputCls} value={d.institucion_nueva} onChange={(e) => set("institucion_nueva", e.target.value)} placeholder="Nombre de la nueva institución" />
                  <input className={inputCls} value={d.institucion_nueva_tipo} onChange={(e) => set("institucion_nueva_tipo", e.target.value)} placeholder="Tipo (club, escuela, iglesia, ONG…)" />
                  <button type="button" onClick={() => { setInstNueva(false); set("institucion_nueva", ""); }} className="text-sm font-bold text-petroleo hover:underline">
                    Elegir una existente
                  </button>
                </div>
              ) : (
                <select
                  id="inst"
                  className={inputCls}
                  value={d.institucion_id}
                  onChange={(e) => {
                    if (e.target.value === "__nueva") {
                      setInstNueva(true);
                      set("institucion_id", "");
                    } else set("institucion_id", e.target.value);
                  }}
                >
                  <option value="">Ninguna / sin institución externa</option>
                  {opciones.instituciones.map((i) => <option key={i.id} value={i.id}>{i.nombre}{i.tipo ? ` (${i.tipo})` : ""}</option>)}
                  <option value="__nueva">+ Agregar nueva institución</option>
                </select>
              )}
            </Campo>
          </SiNo>
        </div>
      )}

      {/* PASO 4 */}
      {paso === 3 && (
        <div>
          <SiNo label="¿Requiere gazebos?" value={d.gazebo} onChange={(v) => set("gazebo", v)}>
            <Cantidad value={d.gazebo_cant} onChange={(n) => set("gazebo_cant", n)} label="Cantidad de gazebos" />
          </SiNo>
          <SiNo label="¿Requiere mesas?" value={d.mesas} onChange={(v) => set("mesas", v)}>
            <Cantidad value={d.mesas_cant} onChange={(n) => set("mesas_cant", n)} label="Cantidad de mesas" />
          </SiNo>
          <SiNo label="¿Requiere sillas?" value={d.sillas} onChange={(v) => set("sillas", v)}>
            <Cantidad value={d.sillas_cant} onChange={(n) => set("sillas_cant", n)} label="Cantidad de sillas" />
          </SiNo>
          <SiNo label="¿Precisa bajada de luz?" value={d.luz} onChange={(v) => set("luz", v)} />
          <SiNo label="¿Requiere equipo de proyección y sonido?" value={d.sonido} onChange={(v) => set("sonido", v)} />
          <SiNo
            label="¿Requiere algún otro insumo?"
            value={d.insumos.length > 0}
            onChange={(v) => set("insumos", v ? (d.insumos.length ? d.insumos : [{ descripcion: "", tipo: "", cantidad: 1, costo: 0 }]) : [])}
          >
            <ul className="space-y-3">
              {d.insumos.map((ins, i) => (
                <li key={i} className="rounded-xl bg-fondo p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-gris">Insumo {i + 1}</span>
                    <button type="button" onClick={() => set("insumos", d.insumos.filter((_, j) => j !== i))} className="rounded-lg p-1 text-gris hover:bg-white" aria-label="Quitar insumo">
                      <IconX size={18} />
                    </button>
                  </div>
                  <input className={cx(inputCls, "mb-2")} value={ins.descripcion} onChange={(e) => setInsumo(i, { descripcion: e.target.value })} placeholder="Detalle (ej: Harina leudante 1 kg)" aria-label="Detalle del insumo" />
                  <div className="grid grid-cols-3 gap-2">
                    <select className={inputCls} value={ins.tipo} onChange={(e) => setInsumo(i, { tipo: e.target.value })} aria-label="Tipo de insumo">
                      <option value="">Tipo</option>
                      {opciones.tiposInsumo.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                    </select>
                    <input className={inputCls} type="number" inputMode="numeric" min={0} value={ins.cantidad || ""} onChange={(e) => setInsumo(i, { cantidad: Number(e.target.value) })} placeholder="Cant." aria-label="Cantidad" />
                    <input className={inputCls} type="number" inputMode="numeric" min={0} value={ins.costo || ""} onChange={(e) => setInsumo(i, { costo: Number(e.target.value) })} placeholder="$ aprox." aria-label="Costo aproximado" />
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => set("insumos", [...d.insumos, { descripcion: "", tipo: "", cantidad: 1, costo: 0 }])} className={cx(btn("secundario", "sm"), "mt-3")}>
              <IconPlus size={18} /> Agregar otro insumo
            </button>
          </SiNo>

          <div className="mt-4 grid gap-x-3 sm:grid-cols-2">
            <Campo label="Costo estimado total" htmlFor="ce" hint={autoCosto ? "Se calcula solo con la suma de los insumos." : undefined}>
              <input
                id="ce"
                type="number"
                inputMode="numeric"
                min={0}
                className={inputCls}
                value={autoCosto ? sumaInsumos || "" : d.costo_estimado ?? ""}
                disabled={autoCosto}
                onChange={(e) => set("costo_estimado", Number(e.target.value))}
              />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={autoCosto} onChange={(e) => { setAutoCosto(e.target.checked); if (!e.target.checked) set("costo_estimado", sumaInsumos); }} className="size-5 accent-[#3f742c]" />
                Calcular automáticamente
              </label>
            </Campo>
            {esEdicion && (
              <Campo label="Costo real" optional htmlFor="cr" hint="También se pide al cerrar la actividad.">
                <input id="cr" type="number" inputMode="numeric" min={0} className={inputCls} value={d.costo_real || ""} onChange={(e) => set("costo_real", Number(e.target.value))} />
              </Campo>
            )}
          </div>
          <Campo label="Observaciones logísticas" optional htmlFor="obl">
            <textarea id="obl" rows={3} className={inputCls} value={d.obs_logistica} onChange={(e) => set("obs_logistica", e.target.value)} />
          </Campo>
        </div>
      )}

      {/* PASO 5 */}
      {paso === 4 && (
        <div>
          <SiNo label="¿Requiere flyer?" value={d.requiere_flyer} onChange={(v) => set("requiere_flyer", v)}>
            {!opciones.gestionaFlyer ? (
              <p className="text-sm text-gris">
                El pedido le llega al equipo de diseño{d.estado_flyer ? ` (estado actual: ${d.estado_flyer.toLowerCase()})` : ""}. Cuando esté listo, vas a poder ver y descargar el flyer desde la ficha de la actividad.
              </p>
            ) : (
            <>
            <Campo label="Estado del flyer">
              <Chips label="Estado del flyer" value={d.estado_flyer || "SOLICITADO"} onChange={(v) => set("estado_flyer", v)} options={ESTADOS_FLYER.map((e) => [e, e] as const)} />
            </Campo>
            <Campo label="Link al flyer terminado" optional htmlFor="lf" hint="Cuando esté listo, la imagen se sube desde la ficha de la actividad o la pantalla Flyers. También podés pegar acá un link de Drive o Canva.">
              <input id="lf" type="url" inputMode="url" className={inputCls} value={d.link_flyer} onChange={(e) => set("link_flyer", e.target.value)} placeholder="https://…" />
            </Campo>
            </>
            )}
          </SiNo>
          <SiNo label="¿Generar formulario de inscripción propio?" value={d.generar_formulario} onChange={(v) => set("generar_formulario", v)}>
            <p className="mb-3 text-sm text-gris">
              Se crea un link público (sin usuario ni contraseña) para compartir o publicar en la página de Cuqui Calvano. Pide nombre, apellido, DNI, ciudad o localidad, barrio (opcional en el interior), dirección, fecha de nacimiento y WhatsApp.
            </p>
            {esTallerEscuela({ tipo: d.tipo, nombre: d.nombre }) && (
              <p className="mb-3 rounded-xl bg-verde-50 px-3 py-2 text-sm text-marca-600">
                Todos los formularios preguntan además si ya participó de nuestras actividades, si quiere ser profe (y qué enseñaría) y si conoce un espacio para talleres.
              </p>
            )}
            <Campo label="Preguntas adicionales" optional htmlFor="pe" hint="Una pregunta por línea. Para elegir entre opciones, ponelas entre corchetes: ¿Trae materiales? [Sí / No]">
              <textarea id="pe" rows={4} className={inputCls} value={d.preguntas_extra} onChange={(e) => set("preguntas_extra", e.target.value)} />
            </Campo>
          </SiNo>
          <p className="mt-2 rounded-xl bg-petroleo-50 px-4 py-3 text-sm text-petroleo-600">
            ¿Las inscripciones se hacen por Google Forms? Después de guardar, desde la ficha de la actividad podés <b>importar el Excel o CSV</b> de las respuestas.
          </p>
        </div>
      )}

      {/* PASO 6 */}
      {paso === 5 && (
        <div className="space-y-3">
          <Resumen titulo="Información general" onEdit={() => setPaso(0)}>
            <Dato k="Nombre" v={d.nombre} />
            <Dato k="Responsable" v={d.responsable} />
            <Dato k={interior ? "Región" : "Zona"} v={zonaLabel(d.zona)} />
            {interior && <Dato k="Localidad" v={d.localidad} />}
            <Dato k="Tipo" v={d.tipo} />
            <Dato k="Estado" v={d.estado} />
          </Resumen>
          <Resumen titulo="Fecha y ubicación" onEdit={() => setPaso(1)}>
            <Dato k="Fecha" v={d.fecha ? `${d.fecha.split("-").reverse().join("/")} ${d.hora_inicio}${d.hora_fin ? `–${d.hora_fin}` : ""}` : ""} />
            {d.fecha_alt && <Dato k="Alternativa" v={`${d.fecha_alt.split("-").reverse().join("/")} ${d.hora_alt}`} />}
            <Dato k="Barrio" v={titleCase(d.barrio)} />
            <Dato k="Dirección" v={[d.direccion, d.entre_calles && `(entre ${d.entre_calles})`, d.lugar].filter(Boolean).join(" · ")} />
            <Dato k="Mapa" v={d.lat ? "✓ Ubicada" : "Sin ubicar"} />
          </Resumen>
          <Resumen titulo="Articulación y público" onEdit={() => setPaso(2)}>
            <Dato k="Público" v={titleCase(d.publico)} />
            <Dato k="Articulación" v={d.articula ? [d.tipo_articulacion, d.mesa, d.institucion_nueva || opciones.instituciones.find((i) => i.id === d.institucion_id)?.nombre].filter(Boolean).join(" · ") || "Sí" : "No"} />
          </Resumen>
          <Resumen titulo="Logística" onEdit={() => setPaso(3)}>
            <Dato k="Requerimientos" v={[d.gazebo && `${d.gazebo_cant} gazebo(s)`, d.mesas && `${d.mesas_cant} mesa(s)`, d.sillas && `${d.sillas_cant} silla(s)`, d.luz && "bajada de luz", d.sonido && "proyección/sonido"].filter(Boolean).join(", ") || "Ninguno"} />
            {d.insumos.length > 0 && <Dato k="Otros insumos" v={d.insumos.filter((i) => i.descripcion).map((i) => i.descripcion).join(", ")} />}
            <Dato k="Costo estimado" v={formatMoney(costoEstimado)} />
          </Resumen>
          <Resumen titulo="Comunicación e inscripción" onEdit={() => setPaso(4)}>
            <Dato k="Flyer" v={d.requiere_flyer ? d.estado_flyer || "SOLICITADO" : "No"} />
            <Dato k="Formulario propio" v={d.generar_formulario ? "Sí" : "No"} />
          </Resumen>
          <Campo label="Observaciones" optional htmlFor="obs">
            <textarea id="obs" rows={3} className={inputCls} value={d.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </Campo>
        </div>
      )}

      {/* Navegación */}
      <form action={formAction} className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <input type="hidden" name="payload" value={payload} />
        {paso > 0 ? (
          <button type="button" onClick={() => ir(paso - 1)} className={btn("secundario", "lg")}>
            <IconArrowLeft size={20} /> Anterior
          </button>
        ) : (
          <span />
        )}
        {/* Claves distintas: si React reutilizara el mismo botón, el clic en «Siguiente» del paso 5
            lo convertiría en «Guardar» en medio del evento y enviaría el formulario sin confirmar. */}
        {paso < PASOS.length - 1 ? (
          <button key="siguiente" type="button" onClick={() => ir(paso + 1)} className={btn("primario", "lg")}>
            Siguiente <IconArrowRight size={20} />
          </button>
        ) : (
          <button key="guardar" type="submit" disabled={pending} className={btn("primario", "lg")} onClick={(e) => { if (!validarPaso(0) || !validarPaso(1)) e.preventDefault(); }}>
            <IconCheck size={20} /> {pending ? "Guardando…" : esEdicion ? "Guardar cambios" : "Guardar actividad"}
          </button>
        )}
      </form>
      {esEdicion && paso < PASOS.length - 1 && (
        <form action={formAction} className="mt-3 text-center">
          <input type="hidden" name="payload" value={payload} />
          <button type="submit" disabled={pending} className="text-sm font-bold text-petroleo hover:underline" onClick={(e) => { if (!validarPaso(0) || !validarPaso(1)) e.preventDefault(); }}>
            {pending ? "Guardando…" : "Guardar cambios ahora"}
          </button>
        </form>
      )}
    </div>
  );
}

function Cantidad({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-gris">{label}</span>
      <div className="flex items-center rounded-xl border border-linea bg-white">
        <button type="button" onClick={() => onChange(Math.max(0, (value || 0) - 1))} className="size-11 text-xl font-bold text-petroleo" aria-label="Menos">−</button>
        <input type="number" inputMode="numeric" min={0} value={value || ""} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="h-11 w-16 border-x border-linea text-center font-bold focus:outline-none" aria-label={label} />
        <button type="button" onClick={() => onChange((value || 0) + 1)} className="size-11 text-xl font-bold text-petroleo" aria-label="Más">+</button>
      </div>
    </div>
  );
}

function Resumen({ titulo, children, onEdit }: { titulo: string; children: ReactNode; onEdit: () => void }) {
  return (
    <section className="rounded-2xl border border-linea bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold">{titulo}</h3>
        <button type="button" onClick={onEdit} className="text-sm font-bold text-petroleo hover:underline">Editar</button>
      </div>
      <dl className="space-y-1 text-[15px]">{children}</dl>
    </section>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-gris">{k}</dt>
      <dd className="min-w-0 font-semibold">{v || "—"}</dd>
    </div>
  );
}
