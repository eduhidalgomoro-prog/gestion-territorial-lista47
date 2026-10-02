"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { IconCheck, IconCloudOff, IconSearch, IconUserPlus, IconX } from "@/components/icons";
import { btn, cx } from "@/components/ui";
import type { ActionResult } from "@/lib/errors";
import { normalizeText, titleCase } from "@/lib/format";
import type { EstadoAsistencia } from "@/lib/schema";
import { agregarPresenteAction, buscarDniAction, guardarMarcasAction } from "../../../actions";

interface Persona {
  id: string;
  nombre: string;
  detalle: string;
  dni: string;
  estado: EstadoAsistencia | null;
}

interface Marca {
  participanteId: string;
  estado: EstadoAsistencia;
  ts: string;
}

type Filtro = "todos" | "sin" | "PRESENTE" | "AUSENTE";

/**
 * Toma de asistencia pensada para el celular:
 * - un toque marca PRESENTE / AUSENTE y se ve al instante;
 * - las marcas se envían solas; si no hay señal quedan guardadas en el teléfono y se envían al volver.
 */
export function TomaAsistencia({ actividadId, inicial, barrios, puedeCerrar }: { actividadId: string; inicial: Persona[]; barrios: string[]; puedeCerrar: boolean }) {
  const KEY = `gt47-asis-${actividadId}`;
  const [personas, setPersonas] = useState<Persona[]>(inicial);
  const [pendientes, setPendientes] = useState<Marca[]>([]);
  const [estadoEnvio, setEstadoEnvio] = useState<"ok" | "enviando" | "offline" | "error">("ok");
  const [busq, setBusq] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [agregar, setAgregar] = useState(false);
  const enviando = useRef(false);
  // Copia sincrónica de la cola (el estado de React se actualiza recién en el próximo render).
  const pendRef = useRef<Marca[]>([]);

  // Marcas que quedaron sin enviar (por ejemplo, se cerró la app sin señal).
  useEffect(() => {
    try {
      const guardadas = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Marca[];
      if (guardadas.length) {
        pendRef.current = guardadas;
        // Se lee después de montar (en el servidor no existe localStorage): evita diferencias de hidratación.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendientes(guardadas);
        setPersonas((ps) => ps.map((p) => ({ ...p, estado: [...guardadas].reverse().find((m) => m.participanteId === p.id)?.estado ?? p.estado })));
      }
    } catch {
      // sin almacenamiento local: se sigue funcionando en línea
    }
  }, [KEY]);

  const persistir = useCallback(
    (lista: Marca[]) => {
      try {
        if (lista.length) localStorage.setItem(KEY, JSON.stringify(lista));
        else localStorage.removeItem(KEY);
      } catch {
        // ignorar
      }
    },
    [KEY],
  );

  const setPend = useCallback(
    (lista: Marca[]) => {
      pendRef.current = lista;
      setPendientes(lista);
      persistir(lista);
    },
    [persistir],
  );

  const enviar = useCallback(async () => {
    if (enviando.current) return;
    const lote = pendRef.current;
    if (!lote.length) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setEstadoEnvio("offline");
      return;
    }
    enviando.current = true;
    setEstadoEnvio("enviando");
    try {
      const r = await guardarMarcasAction(actividadId, lote);
      if (!r.ok) throw new Error(r.message);
      setPend(pendRef.current.filter((m) => !lote.includes(m)));
      setEstadoEnvio("ok");
    } catch {
      setEstadoEnvio(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
    } finally {
      enviando.current = false;
    }
  }, [actividadId, setPend]);

  useEffect(() => {
    if (!pendientes.length) return;
    const t = setTimeout(enviar, 400);
    const iv = setInterval(enviar, 15000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [pendientes, enviar]);

  useEffect(() => {
    const on = () => enviar();
    const off = () => setEstadoEnvio("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [enviar]);

  function marcar(id: string, estado: EstadoAsistencia) {
    setPersonas((ps) => ps.map((p) => (p.id === id ? { ...p, estado } : p)));
    const m: Marca = { participanteId: id, estado, ts: new Date().toISOString() };
    // Si había una marca anterior de la misma persona sin enviar, se reemplaza.
    setPend([...pendRef.current.filter((x) => x.participanteId !== id), m]);
  }

  const presentes = personas.filter((p) => p.estado === "PRESENTE").length;
  const ausentes = personas.filter((p) => p.estado === "AUSENTE").length;
  const sinMarcar = personas.length - presentes - ausentes;

  const visibles = useMemo(() => {
    const q = normalizeText(busq);
    const digitos = busq.replace(/\D/g, "");
    return personas.filter((p) => {
      if (filtro === "sin" && p.estado) return false;
      if ((filtro === "PRESENTE" || filtro === "AUSENTE") && p.estado !== filtro) return false;
      if (!q) return true;
      if (digitos.length >= 3 && p.dni && (p.dni.includes(digitos) || digitos.endsWith(p.dni))) return true;
      return normalizeText(p.nombre).includes(q);
    });
  }, [personas, busq, filtro]);

  return (
    <div>
      {/* Resumen y búsqueda fijos arriba */}
      <div className="sticky top-14 z-20 -mx-4 bg-fondo/95 px-4 pt-1 pb-3 backdrop-blur lg:top-0">
        <div className="mb-2 grid grid-cols-3 gap-2 text-center">
          <Contador n={presentes} label="Presentes" activo={filtro === "PRESENTE"} onClick={() => setFiltro(filtro === "PRESENTE" ? "todos" : "PRESENTE")} tono="verde" />
          <Contador n={ausentes} label="Ausentes" activo={filtro === "AUSENTE"} onClick={() => setFiltro(filtro === "AUSENTE" ? "todos" : "AUSENTE")} tono="gris" />
          <Contador n={sinMarcar} label="Sin marcar" activo={filtro === "sin"} onClick={() => setFiltro(filtro === "sin" ? "todos" : "sin")} tono="petroleo" />
        </div>
        {personas.length > 0 && (
          <div className="mb-2">
            <div className="flex items-baseline justify-between text-sm">
              <span><b className="font-titulo text-lg text-marca">{presentes}</b> <span className="text-gris">de {personas.length} presentes</span></span>
              <span className="font-semibold text-gris">{Math.round(((presentes + ausentes) / personas.length) * 100)}% registrado</span>
            </div>
            <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-linea" role="img" aria-label={`${presentes} presentes y ${ausentes} ausentes de ${personas.length}`}>
              <div className="h-full bg-verde transition-[width] duration-300" style={{ width: `${(presentes / personas.length) * 100}%` }} />
              <div className="h-full bg-gris/40 transition-[width] duration-300" style={{ width: `${(ausentes / personas.length) * 100}%` }} />
            </div>
          </div>
        )}
        <label className="relative block">
          <span className="sr-only">Buscar participante</span>
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gris" size={20} />
          <input
            type="search"
            value={busq}
            onChange={(e) => setBusq(e.target.value)}
            placeholder="BUSCAR PARTICIPANTE (nombre o DNI)"
            className="h-12 w-full rounded-xl border border-linea bg-white pr-3 pl-10 text-[16px] placeholder:text-gris/70 focus:border-petroleo focus:outline-none"
          />
        </label>
        <EstadoEnvio estado={estadoEnvio} pendientes={pendientes.length} onRetry={enviar} />
      </div>

      <button type="button" onClick={() => setAgregar(true)} className={cx(btn("petroleo", "lg"), "mb-3 w-full")}>
        <IconUserPlus /> AGREGAR PARTICIPANTE
      </button>

      {personas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-linea bg-white p-6 text-center text-gris">
          No hay inscriptos todavía. Agregá a las personas a medida que llegan.
        </p>
      ) : visibles.length === 0 ? (
        <p className="p-6 text-center text-gris">Nadie coincide con la búsqueda.</p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((p) => (
            <li key={p.id} className={cx("rounded-2xl border bg-white p-3", p.estado === "PRESENTE" ? "border-verde" : "border-linea")}>
              <div className="mb-2 min-w-0">
                <p className="truncate text-[16px] font-bold">{p.nombre}</p>
                {p.detalle && <p className="truncate text-sm text-gris">{p.detalle}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => marcar(p.id, "PRESENTE")}
                  aria-pressed={p.estado === "PRESENTE"}
                  className={cx(
                    "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border-2 text-[15px] font-extrabold",
                    p.estado === "PRESENTE" ? "border-marca bg-marca text-white" : "border-linea text-marca hover:border-marca",
                  )}
                >
                  <IconCheck size={20} /> PRESENTE
                </button>
                <button
                  type="button"
                  onClick={() => marcar(p.id, "AUSENTE")}
                  aria-pressed={p.estado === "AUSENTE"}
                  className={cx(
                    "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border-2 text-[15px] font-extrabold",
                    p.estado === "AUSENTE" ? "border-gris bg-gris text-white" : "border-linea text-gris hover:border-gris",
                  )}
                >
                  <IconX size={20} /> AUSENTE
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Finalizar: las marcas ya se guardan solas; esto resume y lleva a cerrar la actividad. */}
      {personas.length > 0 && (
        <div className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-linea">
          <p className="text-xs font-bold tracking-wide text-gris uppercase">Asistencia</p>
          <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
            {[
              [personas.length, "inscriptos"],
              [presentes, "presentes"],
              [ausentes + sinMarcar, "ausentes"],
              [`${Math.round((presentes / personas.length) * 100)}%`, "asistencia"],
            ].map(([n, l], i) => (
              <div key={String(l)}>
                <dd className={cx("font-titulo text-2xl font-extrabold tabular-nums", i === 1 && "text-marca")}>{n}</dd>
                <dt className="text-xs text-gris">{l}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-center text-sm text-gris">
            Las marcas se guardan solas.{sinMarcar > 0 && ` ${sinMarcar} sin marcar cuentan como ausentes al cerrar.`}
          </p>
          {puedeCerrar && (
            <Link href={`/actividades/${actividadId}/cerrar`} className={cx(btn("primario", "lg"), "mt-3 w-full")}>
              <IconCheck /> Finalizar asistencia y cerrar la actividad
            </Link>
          )}
        </div>
      )}

      {agregar && (
        <AgregarPersona
          actividadId={actividadId}
          barrios={barrios}
          onClose={() => setAgregar(false)}
          onAgregada={(id, nombre) => {
            setPersonas((ps) => (ps.some((p) => p.id === id) ? ps.map((p) => (p.id === id ? { ...p, estado: "PRESENTE" } : p)) : [{ id, nombre, detalle: "Agregada recién", dni: "", estado: "PRESENTE" }, ...ps]));
            setAgregar(false);
          }}
        />
      )}
    </div>
  );
}

function Contador({ n, label, activo, onClick, tono }: { n: number; label: string; activo: boolean; onClick: () => void; tono: "verde" | "gris" | "petroleo" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cx(
        "rounded-xl border-2 py-2",
        activo ? "border-tinta" : "border-transparent",
        tono === "verde" ? "bg-verde-50 text-marca-600" : tono === "gris" ? "bg-white text-gris" : "bg-petroleo-50 text-petroleo-600",
      )}
    >
      <span className="font-titulo block text-2xl leading-none font-extrabold tabular-nums">{n}</span>
      <span className="text-[11px] font-bold tracking-wide uppercase">{label}</span>
    </button>
  );
}

function EstadoEnvio({ estado, pendientes, onRetry }: { estado: string; pendientes: number; onRetry: () => void }) {
  if (!pendientes && estado === "ok") return <p className="mt-2 text-xs font-semibold text-ok">✓ Todo guardado en la planilla</p>;
  if (estado === "enviando") return <p className="mt-2 text-xs font-semibold text-petroleo">Guardando {pendientes} {pendientes === 1 ? "marca" : "marcas"}…</p>;
  if (estado === "offline")
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-alerta">
        <IconCloudOff size={16} /> Sin conexión: {pendientes} {pendientes === 1 ? "marca guardada" : "marcas guardadas"} en el celular. Se envían solas al volver la señal.
      </p>
    );
  if (estado === "error")
    return (
      <p className="mt-2 text-xs font-bold text-peligro">
        No se pudieron guardar {pendientes} {pendientes === 1 ? "marca" : "marcas"}.{" "}
        <button type="button" onClick={onRetry} className="underline">Reintentar</button>
      </p>
    );
  return <p className="mt-2 text-xs font-semibold text-gris">{pendientes} por enviar…</p>;
}

const inputCls = "block w-full min-h-12 rounded-xl border border-linea bg-white px-3.5 text-[16px] focus:border-petroleo focus:outline-none aria-[invalid=true]:border-peligro";

function AgregarPersona({ actividadId, barrios, onClose, onAgregada }: { actividadId: string; barrios: string[]; onClose: () => void; onAgregada: (id: string, nombre: string) => void }) {
  const [dni, setDni] = useState("");
  const [encontrada, setEncontrada] = useState<{ nombre: string; apellido: string; barrio: string } | null | undefined>(undefined);
  const [buscando, startBuscar] = useTransition();
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await agregarPresenteAction(actividadId, prev, fd);
    const data = r.data as { participanteId: string; nombre: string } | undefined;
    if (r.ok && data) onAgregada(data.participanteId, data.nombre);
    return r as ActionResult;
  }, { ok: true });
  const f = state.fields ?? {};

  function buscar() {
    const d = dni.replace(/\D/g, "");
    if (d.length < 6) return;
    startBuscar(async () => {
      const r = await buscarDniAction(actividadId, d);
      setEncontrada(r.ok ? (r.data as typeof encontrada) ?? null : null);
    });
  }

  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="agregar-titulo" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 id="agregar-titulo" className="text-xl font-extrabold">Agregar participante</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gris hover:bg-fondo" aria-label="Cerrar"><IconX /></button>
        </div>
        {offline ? (
          <p className="rounded-xl bg-alerta-50 p-4 text-[15px] text-alerta">Para agregar personas nuevas hace falta conexión. Anotá los datos y cargalos cuando vuelva la señal.</p>
        ) : (
          <form action={action} noValidate>
            {!state.ok && state.message && <p role="alert" className="mb-3 rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro">{state.message}</p>}
            <label className="mb-1.5 block text-[15px] font-bold" htmlFor="dni">DNI</label>
            <div className="mb-3 flex gap-2">
              <input
                id="dni"
                name="dni"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={dni}
                onChange={(e) => {
                  setDni(e.target.value);
                  setEncontrada(undefined);
                }}
                onBlur={buscar}
                className={inputCls}
                aria-invalid={!!f.dni}
                placeholder="Sin puntos"
              />
              <button type="button" onClick={buscar} className={btn("secundario")} disabled={buscando}>{buscando ? "…" : "Buscar"}</button>
            </div>
            {f.dni && <p className="-mt-2 mb-3 text-sm font-semibold text-peligro">{f.dni}</p>}

            {encontrada ? (
              <div className="mb-4 rounded-xl bg-verde-50 p-4">
                <p className="text-sm font-semibold text-marca-600">Ya está en la base:</p>
                <p className="text-lg font-extrabold">{encontrada.nombre} {encontrada.apellido}</p>
                {encontrada.barrio && <p className="text-sm text-gris">{titleCase(encontrada.barrio)}</p>}
                <input type="hidden" name="nombre" value={encontrada.nombre} />
                <input type="hidden" name="apellido" value={encontrada.apellido} />
              </div>
            ) : (
              <>
                {encontrada === null && <p className="mb-3 text-sm font-semibold text-petroleo">Persona nueva: completá sus datos.</p>}
                <div className="grid grid-cols-2 gap-2">
                  <div className="mb-3">
                    <label className="mb-1.5 block text-[15px] font-bold" htmlFor="nombre">Nombre</label>
                    <input id="nombre" name="nombre" className={inputCls} aria-invalid={!!f.nombre} autoComplete="off" />
                  </div>
                  <div className="mb-3">
                    <label className="mb-1.5 block text-[15px] font-bold" htmlFor="apellido">Apellido</label>
                    <input id="apellido" name="apellido" className={inputCls} aria-invalid={!!f.apellido} autoComplete="off" />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="mb-1.5 block text-[15px] font-bold" htmlFor="telefono">Teléfono</label>
                  <input id="telefono" name="telefono" type="tel" inputMode="tel" className={inputCls} placeholder="Ej: 379 4123456" autoComplete="off" />
                </div>
                <div className="mb-4">
                  <label className="mb-1.5 block text-[15px] font-bold" htmlFor="barrio-p">Barrio</label>
                  <input id="barrio-p" name="barrio" list="barrios-p" className={inputCls} autoComplete="off" />
                  <datalist id="barrios-p">{barrios.map((b) => <option key={b} value={b} />)}</datalist>
                </div>
              </>
            )}
            <button type="submit" disabled={pending} className={cx(btn("primario", "lg"), "w-full")}>
              <IconCheck /> {pending ? "Guardando…" : "Agregar y marcar PRESENTE"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
