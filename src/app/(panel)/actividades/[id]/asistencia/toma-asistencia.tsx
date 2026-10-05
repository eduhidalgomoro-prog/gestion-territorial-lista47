"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { IconAlert, IconCheck, IconClock, IconCloudOff, IconSearch, IconUserPlus, IconX } from "@/components/icons";
import { btn, cx } from "@/components/ui";
import type { ActionResult } from "@/lib/errors";
import { normalizeText } from "@/lib/format";
import type { EstadoAsistencia } from "@/lib/schema";
import { agregarPresenteAction, buscarDniAction, guardarMarcasAction } from "../../../actions";

interface Persona {
  id: string;
  nombre: string;
  dniVisible: string; // «••••813»
  dni: string; // para buscar
  estado: EstadoAsistencia | null;
}

interface Marca {
  participanteId: string;
  estado: EstadoAsistencia | ""; // "" = volver a «sin marcar»
  clase: number;
  ts: string;
}

type Filtro = "todos" | "sin" | "PRESENTE" | "AUSENTE";
type Envio = "ok" | "enviando" | "offline" | "error";

const coincide = (estado: Persona["estado"], f: Filtro) => f === "todos" || (f === "sin" ? !estado : estado === f);

/**
 * Toma de asistencia pensada para el celular, con la persona parada en la puerta:
 * BUSCAR → IDENTIFICAR (nombre + últimos números del DNI) → MARCAR → SIGUIENTE.
 * - Un toque marca y se ve al instante; las marcas se envían solas en lote.
 * - Sin señal, quedan guardadas en el celular y se envían al volver (nunca se muestran como guardadas si no lo están).
 */
export function TomaAsistencia({ actividadId, titulo, clase = 1, inicial, barrios, puedeCerrar }: { actividadId: string; titulo: string; clase?: number; inicial: Persona[]; barrios: string[]; puedeCerrar: boolean }) {
  // Lo pendiente sin conexión se guarda aparte por clase (la clase 1 conserva el nombre de siempre).
  const KEY = clase > 1 ? `gt47-asis-${actividadId}-c${clase}` : `gt47-asis-${actividadId}`;
  const [personas, setPersonas] = useState<Persona[]>(inicial);
  const [pendientes, setPendientes] = useState<Marca[]>([]);
  const [estadoEnvio, setEstadoEnvio] = useState<Envio>("ok");
  const [guardadoRecien, setGuardadoRecien] = useState(false);
  const [busq, setBusq] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState<Set<string>>(new Set());
  const [agregar, setAgregar] = useState<{ dni?: string; nombre?: string } | null>(null);
  const [finalizar, setFinalizar] = useState<"preguntar" | "guardando" | "error" | null>(null);
  const [finalizado, setFinalizado] = useState(false);
  const enviando = useRef(false);
  const buscador = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
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
        setPersonas((ps) =>
          ps.map((p) => {
            const m = [...guardadas].reverse().find((x) => x.participanteId === p.id);
            return m ? { ...p, estado: m.estado || null } : p;
          }),
        );
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

  /** Envía la cola. Devuelve true si no quedó nada sin guardar. */
  const enviar = useCallback(async (): Promise<boolean> => {
    if (enviando.current) return false;
    const lote = pendRef.current;
    if (!lote.length) return true;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setEstadoEnvio("offline");
      return false;
    }
    enviando.current = true;
    setEstadoEnvio("enviando");
    try {
      const r = await guardarMarcasAction(actividadId, lote);
      if (!r.ok) throw new Error(r.message);
      setPend(pendRef.current.filter((m) => !lote.includes(m)));
      setEstadoEnvio("ok");
      setGuardadoRecien(true);
      return pendRef.current.length === 0;
    } catch {
      setEstadoEnvio(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
      return false;
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

  // «✓ Guardado» por un momento y después el mensaje tranquilo de siempre.
  useEffect(() => {
    if (!guardadoRecien) return;
    const t = setTimeout(() => setGuardadoRecien(false), 1800);
    return () => clearTimeout(t);
  }, [guardadoRecien]);

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

  function marcar(id: string, estado: EstadoAsistencia | null) {
    const antes = personas.find((p) => p.id === id);
    setPersonas((ps) => ps.map((p) => (p.id === id ? { ...p, estado } : p)));
    setEditando(null);
    const m: Marca = { participanteId: id, estado: estado ?? "", clase, ts: new Date().toISOString() };
    // Si había una marca anterior de la misma persona sin enviar, se reemplaza.
    setPend([...pendRef.current.filter((x) => x.participanteId !== id), m]);
    // Si con el filtro elegido ya no corresponde mostrarla, se va suave (después de ver el cambio).
    if (!coincide(estado, filtro)) {
      setSaliendo((s) => new Set(s).add(id));
      setTimeout(() => setSaliendo((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      }), 700);
    }
    // Buscó a alguien y lo marcó: el buscador queda listo para la siguiente persona.
    if (busq && antes && !antes.estado && estado) buscador.current?.select();
  }

  const presentes = personas.filter((p) => p.estado === "PRESENTE").length;
  const ausentes = personas.filter((p) => p.estado === "AUSENTE").length;
  const sinMarcar = personas.length - presentes - ausentes;
  const registrados = presentes + ausentes;
  const pct = personas.length ? Math.round((registrados / personas.length) * 100) : 0;
  const completa = personas.length > 0 && sinMarcar === 0;
  const pendIds = useMemo(() => new Set(pendientes.map((m) => m.participanteId)), [pendientes]);

  const visibles = useMemo(() => {
    const q = normalizeText(busq);
    const digitos = busq.replace(/\D/g, "");
    return personas.filter((p) => {
      if (!coincide(p.estado, filtro) && !saliendo.has(p.id)) return false;
      if (!q) return true;
      if (digitos.length >= 3 && p.dni && (p.dni.includes(digitos) || digitos.endsWith(p.dni))) return true;
      return normalizeText(p.nombre).includes(q);
    });
  }, [personas, busq, filtro, saliendo]);

  function elegirFiltro(f: Filtro) {
    setFiltro(f);
    setEditando(null);
    listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function confirmarFinal() {
    setFinalizar("guardando");
    // Si justo se está enviando un lote, se espera a que termine (hasta 15 s) antes de mandar lo que quede.
    for (let i = 0; i < 75 && enviando.current; i++) await new Promise((r) => setTimeout(r, 200));
    const ok = await enviar();
    if (!ok && pendRef.current.length && navigator.onLine) {
      setFinalizar("error");
      return;
    }
    setFinalizar(null);
    setFinalizado(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pedirFinal() {
    if (sinMarcar > 0) setFinalizar("preguntar");
    else confirmarFinal();
  }

  if (finalizado) {
    return (
      <ResumenFinal
        titulo={titulo}
        total={personas.length}
        presentes={presentes}
        ausentes={ausentes}
        sinMarcar={sinMarcar}
        porEnviar={pendientes.length}
        actividadId={actividadId}
        puedeCerrar={puedeCerrar}
        onRevisar={() => setFinalizado(false)}
      />
    );
  }

  const chips: { f: Filtro; label: string; n: number; tono: string }[] = [
    { f: "todos", label: "Todos", n: personas.length, tono: "text-tinta" },
    { f: "sin", label: "Sin marcar", n: sinMarcar, tono: "text-petroleo-600" },
    { f: "PRESENTE", label: "Presentes", n: presentes, tono: "text-marca-600" },
    { f: "AUSENTE", label: "Ausentes", n: ausentes, tono: "text-gris" },
  ];

  return (
    <div>
      {/* Progreso */}
      {personas.length > 0 && (
        <section className="mb-3 rounded-[22px] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,105,133,0.06)] ring-1 ring-linea/70" aria-label="Progreso de la asistencia">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[15px] text-gris">
              <b className="font-titulo text-[22px] text-tinta tabular-nums">{registrados}</b> de {personas.length} registrados
            </p>
            <p className={cx("font-titulo text-[20px] font-extrabold tabular-nums", completa ? "text-marca" : "text-petroleo-600")}>{pct}%</p>
          </div>
          <div
            className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-fondo"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${presentes} presentes y ${ausentes} ausentes de ${personas.length}`}
          >
            <div className="h-full bg-verde transition-[width] duration-300 ease-out" style={{ width: `${(presentes / personas.length) * 100}%` }} />
            <div className="h-full bg-[#b8c2cc] transition-[width] duration-300 ease-out" style={{ width: `${(ausentes / personas.length) * 100}%` }} />
          </div>
          {completa && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-verde-50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 font-extrabold text-marca-600">
                <IconCheck size={20} strokeWidth={2.6} /> Asistencia completa
              </p>
              <button type="button" onClick={pedirFinal} className="inline-flex h-10 items-center rounded-full bg-marca px-4 text-[14px] font-extrabold text-white hover:bg-marca-600 active:scale-[0.97]">
                Finalizar
              </button>
            </div>
          )}
        </section>
      )}

      {/* Buscador y filtros: quedan a mano al bajar por la lista */}
      <div className="sticky top-14 z-20 -mx-4 bg-fondo/95 px-4 pt-2 pb-2 backdrop-blur-md lg:top-0">
        <label className="relative block">
          <span className="sr-only">Buscar participante</span>
          <IconSearch className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gris" size={21} />
          <input
            ref={buscador}
            type="search"
            value={busq}
            onChange={(e) => setBusq(e.target.value)}
            placeholder="Buscar por nombre o DNI"
            enterKeyHint="search"
            autoComplete="off"
            className="h-12 w-full rounded-2xl border border-linea bg-white pr-11 pl-11 text-[17px] shadow-[0_1px_2px_rgba(16,105,133,0.05)] placeholder:text-gris/80 focus:border-petroleo focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {busq && (
            <button type="button" onClick={() => { setBusq(""); buscador.current?.focus(); }} className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-gris hover:bg-fondo" aria-label="Borrar búsqueda">
              <IconX size={18} />
            </button>
          )}
        </label>
        <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label="Filtrar la lista">
          {chips.map((c) => {
            const activo = filtro === c.f;
            return (
              <button
                key={c.f}
                type="button"
                onClick={() => elegirFiltro(c.f)}
                aria-pressed={activo}
                className={cx(
                  "flex min-h-[52px] flex-col items-center justify-center rounded-2xl px-1 transition-colors duration-150 active:scale-[0.97]",
                  activo ? "bg-petroleo text-white shadow-[0_2px_6px_rgba(16,105,133,0.25)]" : "bg-white ring-1 ring-linea/80 hover:ring-petroleo/50",
                )}
              >
                <span className={cx("font-titulo text-[19px] leading-none font-extrabold tabular-nums", !activo && c.tono)}>{c.n}</span>
                <span className={cx("mt-1 text-[12.5px] leading-none font-bold", activo ? "text-white/90" : "text-gris")}>{c.label}</span>
              </button>
            );
          })}
        </div>
        <EstadoEnvio estado={estadoEnvio} pendientes={pendientes.length} recien={guardadoRecien} onRetry={enviar} />
      </div>

      <div ref={listaRef} className="scroll-mt-48 lg:scroll-mt-40">
        <div className="mt-1 mb-2 flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-gris">
            {busq || filtro !== "todos" ? `${visibles.length} de ${personas.length}` : `${personas.length} ${personas.length === 1 ? "inscripto" : "inscriptos"}`}
          </p>
          <button type="button" onClick={() => setAgregar({})} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-bold text-petroleo hover:bg-petroleo-50">
            <IconUserPlus size={19} /> Agregar participante
          </button>
        </div>

        {personas.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-linea bg-white p-6 text-center">
            <p className="text-[16px] text-gris">No hay inscriptos todavía. Agregá a las personas a medida que llegan.</p>
            <button type="button" onClick={() => setAgregar({})} className={cx(btn("primario", "lg"), "mt-4")}>
              <IconUserPlus /> Agregar participante
            </button>
          </div>
        ) : visibles.length === 0 ? (
          busq ? (
            <div className="rounded-[22px] bg-white p-6 text-center ring-1 ring-linea/70">
              <p className="text-[16px] font-semibold">No encontramos a esta persona entre los inscriptos.</p>
              <button
                type="button"
                onClick={() => setAgregar(/^\d[\d.\s]*$/.test(busq.trim()) ? { dni: busq.replace(/\D/g, "") } : { nombre: busq.trim() })}
                className={cx(btn("petroleo", "lg"), "mt-4")}
              >
                <IconUserPlus /> Agregar participante
              </button>
            </div>
          ) : (
            <p className="rounded-[22px] bg-white p-6 text-center text-[16px] text-gris ring-1 ring-linea/70">
              {filtro === "sin" ? "¡No queda nadie sin marcar!" : filtro === "PRESENTE" ? "Todavía no hay presentes." : "No hay ausentes."}
            </p>
          )
        ) : (
          <ul className="space-y-2">
            {visibles.map((p) => (
              <Tarjeta
                key={p.id}
                p={p}
                abierta={editando === p.id}
                saliendo={saliendo.has(p.id)}
                pendiente={pendIds.has(p.id) ? (estadoEnvio === "error" ? "error" : estadoEnvio === "offline" ? "offline" : "enviando") : null}
                onMarcar={(e) => marcar(p.id, e)}
                onEditar={() => setEditando(editando === p.id ? null : p.id)}
              />
            ))}
          </ul>
        )}

        {/* Finalizar: las marcas ya se guardan solas; esto cierra la toma con un resumen. */}
        {personas.length > 0 && (
          <section className="mt-6 rounded-[22px] bg-white p-5 text-center shadow-[0_1px_2px_rgba(16,105,133,0.06)] ring-1 ring-linea/70">
            {completa ? (
              <>
                <p className="flex items-center justify-center gap-1.5 font-titulo text-[19px] font-extrabold text-marca-600">
                  <IconCheck size={22} strokeWidth={2.6} /> Asistencia completa
                </p>
                <p className="mt-1 text-[15px] text-gris">
                  {personas.length} de {personas.length} registrados · {presentes} {presentes === 1 ? "presente" : "presentes"} · {ausentes} {ausentes === 1 ? "ausente" : "ausentes"}
                </p>
              </>
            ) : (
              <p className="text-[15px] text-gris">
                {sinMarcar === 1 ? "Queda 1 persona" : `Quedan ${sinMarcar} personas`} sin marcar.
              </p>
            )}
            <button type="button" onClick={pedirFinal} className={cx(btn(completa ? "primario" : "secundario", "lg"), "mt-4 w-full")}>
              <IconCheck /> Finalizar asistencia
            </button>
          </section>
        )}
      </div>

      {finalizar && (
        <Hoja onClose={() => finalizar !== "guardando" && setFinalizar(null)} titulo="Finalizar asistencia">
          {finalizar === "error" ? (
            <>
              <p className="flex items-start gap-2 text-[16px] font-semibold text-peligro">
                <IconAlert size={22} className="mt-0.5 shrink-0" /> No pudimos guardar {pendientes.length === 1 ? "1 cambio" : `${pendientes.length} cambios`}. Revisá la conexión.
              </p>
              <button type="button" onClick={confirmarFinal} className={cx(btn("primario", "lg"), "mt-4 w-full")}>Reintentar</button>
            </>
          ) : sinMarcar > 0 ? (
            <>
              <p className="text-[17px] font-semibold">
                Todavía {sinMarcar === 1 ? "queda 1 persona" : `quedan ${sinMarcar} personas`} sin marcar.
              </p>
              <p className="mt-1 text-[15px] text-gris">Si continuás, {sinMarcar === 1 ? "cuenta" : "cuentan"} como {sinMarcar === 1 ? "ausente" : "ausentes"} al cerrar la actividad.</p>
              <button
                type="button"
                onClick={() => { setFinalizar(null); setBusq(""); elegirFiltro("sin"); }}
                className={cx(btn("primario", "lg"), "mt-5 w-full")}
              >
                Ver {sinMarcar === 1 ? "a esa persona" : `las ${sinMarcar} personas`}
              </button>
              <button type="button" onClick={confirmarFinal} disabled={finalizar === "guardando"} className={cx(btn("secundario", "lg"), "mt-2 w-full")}>
                {finalizar === "guardando" ? "Guardando…" : "Continuar igual"}
              </button>
            </>
          ) : (
            <p className="text-[16px] text-gris">Guardando…</p>
          )}
        </Hoja>
      )}

      {agregar && (
        <AgregarPersona
          actividadId={actividadId}
          clase={clase}
          barrios={barrios}
          inicial={agregar}
          onClose={() => setAgregar(null)}
          onAgregada={(id, nombre, dni) => {
            setPersonas((ps) =>
              ps.some((p) => p.id === id)
                ? ps.map((p) => (p.id === id ? { ...p, estado: "PRESENTE" } : p))
                : [{ id, nombre, dniVisible: dni ? `••••${dni.slice(-3)}` : "", dni: dni.slice(-4), estado: "PRESENTE" }, ...ps],
            );
            setAgregar(null);
            setBusq("");
          }}
        />
      )}
    </div>
  );
}

/** Una persona: sin marcar (con los dos botones) o ya registrada (compacta; se toca para corregir). */
function Tarjeta({
  p, abierta, saliendo, pendiente, onMarcar, onEditar,
}: {
  p: Persona;
  abierta: boolean;
  saliendo: boolean;
  pendiente: "enviando" | "offline" | "error" | null;
  onMarcar: (e: EstadoAsistencia | null) => void;
  onEditar: () => void;
}) {
  const base = "rounded-[20px] transition-colors duration-200";
  if (!p.estado) {
    return (
      <li className={cx(base, "bg-white p-3.5 shadow-[0_1px_2px_rgba(16,105,133,0.06)] ring-1 ring-linea/70", saliendo && "asis-salir")}>
        <p className="truncate text-[17px] leading-snug font-bold">{p.nombre}</p>
        <div className="flex items-center gap-2">
          {p.dniVisible && <p className="text-[14px] text-gris tabular-nums">DNI {p.dniVisible}</p>}
          <EstadoGuardado pendiente={pendiente} />
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onMarcar("PRESENTE")}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-marca text-[15px] font-extrabold tracking-wide text-white shadow-[0_2px_6px_rgba(63,116,44,0.22)] transition-transform duration-100 hover:bg-marca-600 active:scale-[0.96]"
          >
            <IconCheck size={20} strokeWidth={2.6} /> PRESENTE
          </button>
          <button
            type="button"
            onClick={() => onMarcar("AUSENTE")}
            className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-fondo text-[15px] font-extrabold tracking-wide text-gris ring-1 ring-linea transition-transform duration-100 hover:text-tinta active:scale-[0.96]"
          >
            <IconX size={20} strokeWidth={2.4} /> AUSENTE
          </button>
        </div>
      </li>
    );
  }

  const presente = p.estado === "PRESENTE";
  return (
    <li className={cx(base, presente ? "bg-verde-50 ring-1 ring-verde/40" : "bg-[#eef1f3] ring-1 ring-[#dde3e8]", saliendo && "asis-salir")}>
      <button type="button" onClick={onEditar} aria-expanded={abierta} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left" aria-label={`${p.nombre}: ${presente ? "presente" : "ausente"}. Tocá para cambiar.`}>
        <span key={p.estado} className={cx("asis-pop flex size-8 shrink-0 items-center justify-center rounded-full text-white", presente ? "bg-marca" : "bg-[#8a96a3]")} aria-hidden>
          {presente ? <IconCheck size={18} strokeWidth={2.8} /> : <IconX size={17} strokeWidth={2.6} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] leading-snug font-bold text-tinta">{p.nombre}</span>
          <span className="flex items-center gap-2">
            {p.dniVisible && <span className="text-[13.5px] text-gris tabular-nums">DNI {p.dniVisible}</span>}
            <EstadoGuardado pendiente={pendiente} />
          </span>
        </span>
        <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold tracking-wide", presente ? "bg-white text-marca-600" : "bg-white/70 text-gris")}>
          {presente ? "PRESENTE" : "AUSENTE"}
        </span>
      </button>
      {abierta && (
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-3" role="group" aria-label="Cambiar asistencia">
          {([
            ["PRESENTE", "Presente", <IconCheck key="c" size={18} strokeWidth={2.6} />],
            ["AUSENTE", "Ausente", <IconX key="x" size={18} strokeWidth={2.4} />],
            [null, "Sin marcar", <span key="o" className="size-3.5 rounded-full border-2 border-current" />],
          ] as const).map(([e, label, icono]) => (
            <button
              key={label}
              type="button"
              onClick={() => onMarcar(e)}
              aria-pressed={p.estado === e}
              className={cx(
                "flex min-h-11 items-center justify-center gap-1 rounded-xl bg-white text-[14px] font-bold ring-1 active:scale-[0.96]",
                p.estado === e ? "ring-2 ring-petroleo text-petroleo-600" : "ring-linea text-tinta",
              )}
            >
              {icono} {label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/** En la tarjeta: solo aparece si esa marca todavía no llegó a la planilla. */
function EstadoGuardado({ pendiente }: { pendiente: "enviando" | "offline" | "error" | null }) {
  if (!pendiente) return null;
  if (pendiente === "error") return <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-alerta"><IconAlert size={14} /> Sin guardar</span>;
  if (pendiente === "offline") return <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-alerta"><IconCloudOff size={14} /> En el celular</span>;
  return <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-gris"><IconClock size={13} /> Guardando…</span>;
}

function EstadoEnvio({ estado, pendientes, recien, onRetry }: { estado: Envio; pendientes: number; recien: boolean; onRetry: () => void }) {
  const cls = "mt-1.5 flex min-h-5 items-center gap-1.5 text-[13px] font-semibold";
  if (estado === "error" && pendientes)
    return (
      <p className={cx(cls, "text-peligro")} role="alert">
        <IconAlert size={16} /> No pudimos guardar {pendientes === 1 ? "1 cambio" : `${pendientes} cambios`}.
        <button type="button" onClick={onRetry} className="ml-1 rounded-full bg-peligro px-2.5 py-0.5 text-[12.5px] font-bold text-white">Reintentar</button>
      </p>
    );
  if (estado === "offline" && pendientes)
    return (
      <p className={cx(cls, "text-alerta")}>
        <IconCloudOff size={16} /> Sin conexión: {pendientes === 1 ? "1 cambio guardado" : `${pendientes} cambios guardados`} en el celular. Se envían solos.
      </p>
    );
  if (pendientes) return <p className={cx(cls, "text-gris")}><IconClock size={14} /> Guardando…</p>;
  if (recien) return <p className={cx(cls, "text-ok")}><IconCheck size={15} strokeWidth={2.6} /> Guardado</p>;
  return <p className={cx(cls, "text-gris")}><IconCheck size={15} className="text-ok" strokeWidth={2.6} /> Cambios guardados automáticamente</p>;
}

/** Hoja que sube desde abajo en el celular (diálogo centrado en la computadora). */
function Hoja({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-[28px] bg-white p-5 pb-8 shadow-xl sm:rounded-[28px] sm:pb-5" style={{ animation: "aparecer .18s ease-out" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-titulo text-[20px] font-extrabold text-petroleo-600">{titulo}</h2>
          <button type="button" onClick={onClose} className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-full text-gris hover:bg-fondo" aria-label="Cerrar"><IconX /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ResumenFinal({
  titulo, total, presentes, ausentes, sinMarcar, porEnviar, actividadId, puedeCerrar, onRevisar,
}: {
  titulo: string; total: number; presentes: number; ausentes: number; sinMarcar: number; porEnviar: number; actividadId: string; puedeCerrar: boolean; onRevisar: () => void;
}) {
  const pct = total ? Math.round((presentes / total) * 100) : 0;
  return (
    <section className="rounded-[28px] bg-white p-6 text-center shadow-[0_1px_3px_rgba(16,105,133,0.08)] ring-1 ring-linea/70" style={{ animation: "aparecer .25s ease-out" }}>
      <span className="asis-pop mx-auto flex size-16 items-center justify-center rounded-full bg-marca text-white" aria-hidden>
        <IconCheck size={34} strokeWidth={2.8} />
      </span>
      <p className="mt-4 text-[13px] font-extrabold tracking-[0.16em] text-marca uppercase">Asistencia registrada</p>
      <h2 className="mt-1 font-titulo text-[24px] leading-tight font-extrabold text-petroleo-600">{titulo}</h2>
      <p className="mt-1 text-[15px] text-gris">{total} {total === 1 ? "inscripto" : "inscriptos"}</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {[
          [presentes, presentes === 1 ? "Presente" : "Presentes", "bg-verde-50 text-marca-600"],
          [ausentes + sinMarcar, ausentes + sinMarcar === 1 ? "Ausente" : "Ausentes", "bg-fondo text-tinta"],
          [`${pct}%`, "Asistencia", "bg-petroleo-50 text-petroleo-600"],
        ].map(([n, l, c]) => (
          <div key={String(l)} className={cx("rounded-2xl py-3.5", String(c))}>
            <p className="font-titulo text-[28px] leading-none font-extrabold tabular-nums">{n}</p>
            <p className="mt-1.5 text-[12.5px] font-bold uppercase">{l}</p>
          </div>
        ))}
      </div>
      {sinMarcar > 0 && <p className="mt-3 text-[14px] text-gris">Incluye {sinMarcar} sin marcar, que cuentan como ausentes.</p>}
      {porEnviar > 0 && (
        <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-alerta-50 px-3 py-2 text-[14px] font-semibold text-alerta">
          <IconCloudOff size={16} /> {porEnviar === 1 ? "1 cambio está guardado" : `${porEnviar} cambios están guardados`} en el celular y se envían al volver la señal.
        </p>
      )}

      <div className="mt-6 grid gap-2">
        {puedeCerrar && (
          <Link href={`/actividades/${actividadId}/cerrar`} className={cx(btn("primario", "lg"), "w-full")}>
            <IconCheck /> Cerrar la actividad
          </Link>
        )}
        <Link href={`/actividades/${actividadId}`} className={cx(btn(puedeCerrar ? "secundario" : "primario", "lg"), "w-full")}>
          Volver a la actividad
        </Link>
        <button type="button" onClick={onRevisar} className="inline-flex min-h-12 items-center justify-center text-[15px] font-bold text-petroleo hover:underline">
          Revisar asistencia
        </button>
      </div>
    </section>
  );
}

const inputCls = "block w-full min-h-12 rounded-xl border border-linea bg-white px-3.5 text-[16px] focus:border-petroleo focus:outline-none aria-[invalid=true]:border-peligro";

/** Llegó alguien que no estaba inscripto: primero el DNI (para no duplicar), después los datos si es nueva. */
function AgregarPersona({
  actividadId, clase, barrios, inicial, onClose, onAgregada,
}: {
  actividadId: string;
  clase: number;
  barrios: string[];
  inicial: { dni?: string; nombre?: string };
  onClose: () => void;
  onAgregada: (id: string, nombre: string, dni: string) => void;
}) {
  const [dni, setDni] = useState(inicial.dni ?? "");
  const [encontrada, setEncontrada] = useState<{ nombre: string; apellido: string } | null | undefined>(undefined);
  const [buscando, startBuscar] = useTransition();
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await agregarPresenteAction(actividadId, prev, fd);
    const data = r.data as { participanteId: string; nombre: string } | undefined;
    if (r.ok && data) onAgregada(data.participanteId, data.nombre, String(fd.get("dni") ?? "").replace(/\D/g, ""));
    return r as ActionResult;
  }, { ok: true });
  const f = state.fields ?? {};
  const [nombreIni, ...resto] = (inicial.nombre ?? "").split(/\s+/);

  function buscar() {
    const d = dni.replace(/\D/g, "");
    if (d.length < 6) return;
    startBuscar(async () => {
      const r = await buscarDniAction(actividadId, d);
      setEncontrada(r.ok ? (r.data as typeof encontrada) ?? null : null);
    });
  }

  // Si se abrió con un DNI ya escrito en el buscador, se busca enseguida.
  const buscadoInicial = useRef(false);
  useEffect(() => {
    if (buscadoInicial.current || (inicial.dni ?? "").length < 6) return;
    buscadoInicial.current = true;
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <Hoja titulo="Agregar participante" onClose={onClose}>
      {offline ? (
        <p className="rounded-xl bg-alerta-50 p-4 text-[15px] text-alerta">Para agregar personas nuevas hace falta conexión. Anotá los datos y cargalos cuando vuelva la señal.</p>
      ) : (
        <form action={action} noValidate className="max-h-[70dvh] overflow-y-auto">
          <input type="hidden" name="clase" value={clase} />
          {!state.ok && state.message && <p role="alert" className="mb-3 rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro">{state.message}</p>}
          <label className="mb-1.5 block text-[15px] font-bold" htmlFor="dni">DNI</label>
          <div className="mb-3 flex gap-2">
            <input
              id="dni"
              name="dni"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={!inicial.dni}
              value={dni}
              onChange={(e) => {
                setDni(e.target.value.replace(/[^\d]/g, "").slice(0, 9));
                setEncontrada(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && encontrada === undefined) {
                  e.preventDefault();
                  buscar();
                }
              }}
              onBlur={buscar}
              className={inputCls}
              aria-invalid={!!f.dni}
              placeholder="Sin puntos"
            />
            <button type="button" onClick={buscar} className={cx(btn("petroleo"), "shrink-0")} disabled={buscando}>
              <IconSearch size={18} /> {buscando ? "…" : "Buscar"}
            </button>
          </div>
          {f.dni && <p className="-mt-2 mb-3 text-sm font-semibold text-peligro">{f.dni}</p>}

          {encontrada ? (
            <div className="mb-4 rounded-2xl bg-verde-50 p-4">
              <p className="text-sm font-semibold text-marca-600">Ya está cargada en la app:</p>
              <p className="text-lg font-extrabold">{encontrada.nombre} {encontrada.apellido}</p>
              <input type="hidden" name="nombre" value={encontrada.nombre} />
              <input type="hidden" name="apellido" value={encontrada.apellido} />
            </div>
          ) : (
            <>
              {encontrada === null && <p className="mb-3 text-sm font-semibold text-petroleo">Persona nueva: completá sus datos.</p>}
              <div className="grid grid-cols-2 gap-2">
                <div className="mb-3">
                  <label className="mb-1.5 block text-[15px] font-bold" htmlFor="nombre">Nombre</label>
                  <input id="nombre" name="nombre" defaultValue={nombreIni} className={inputCls} aria-invalid={!!f.nombre} autoComplete="off" />
                </div>
                <div className="mb-3">
                  <label className="mb-1.5 block text-[15px] font-bold" htmlFor="apellido">Apellido</label>
                  <input id="apellido" name="apellido" defaultValue={resto.join(" ")} className={inputCls} aria-invalid={!!f.apellido} autoComplete="off" />
                </div>
              </div>
              <div className="mb-3">
                <label className="mb-1.5 block text-[15px] font-bold" htmlFor="telefono">Teléfono <span className="font-normal text-gris">(opcional)</span></label>
                <input id="telefono" name="telefono" type="tel" inputMode="tel" className={inputCls} placeholder="Ej: 379 4123456" autoComplete="off" />
              </div>
              <div className="mb-4">
                <label className="mb-1.5 block text-[15px] font-bold" htmlFor="barrio-p">Barrio <span className="font-normal text-gris">(opcional)</span></label>
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
    </Hoja>
  );
}
