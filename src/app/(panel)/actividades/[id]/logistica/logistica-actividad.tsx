"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { IconAlert, IconCheck, IconClock, IconGazebo, IconPlus, IconX } from "@/components/icons";
import { cx } from "@/components/ui";
import { COLOR_ESTADO, ELEMENTOS_COMUNES, fechaHoraCorta, type FilaLogistica, type ResumenLogistico } from "@/lib/logistica";
import type { EstadoElemento, TipoMovimiento } from "@/lib/schema";
import { anularLogisticaAction, movimientoLogisticaAction, preparandoAction } from "../../../actions";

export interface Lote {
  lote: string;
  tipo: TipoMovimiento;
  fecha_hora: string;
  persona: string;
  usuario: string;
  observaciones: string;
  anulado: boolean;
  items: { elemento: string; cantidad: number; estado: EstadoElemento | "" }[];
}

const ESTADO_ELEMENTO_LABEL: Record<string, string> = { BIEN: "Bien", "DAÑADO": "Dañado", INCOMPLETO: "Incompleto" };

/**
 * Logística de una actividad, pensada para el celular: ver qué falta, ENTREGAR y REGISTRAR DEVOLUCIÓN en pocos toques.
 */
export function LogisticaActividad({
  actividadId, resumen: r, historial, sugeridos, ahora, puedeGestionar,
}: {
  actividadId: string;
  resumen: ResumenLogistico;
  historial: Lote[];
  sugeridos: string[];
  ahora: string;
  puedeGestionar: boolean;
}) {
  const router = useRouter();
  const [hoja, setHoja] = useState<"ENTREGA" | "DEVOLUCION" | null>(null);
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState("");

  function ejecutar(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      const res = await fn();
      setAviso(res.message ?? "");
      if (res.ok) router.refresh();
    });
  }

  const quienTiene = r.filas.flatMap((f) => f.quienTiene);

  return (
    <div className="space-y-4">
      {/* Estado general */}
      <section className="rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(16,105,133,0.06)] ring-1 ring-linea/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cx("rounded-full px-3 py-1 text-[13px] font-extrabold uppercase", COLOR_ESTADO[r.estado])}>{r.estado}</span>
          {r.enCirculacion > 0 ? (
            <span className="inline-flex items-center gap-1 text-[14px] font-bold text-alerta"><IconAlert size={16} /> Pendiente de devolución: {r.enCirculacion}</span>
          ) : r.entregado > 0 ? (
            <span className="inline-flex items-center gap-1 text-[14px] font-bold text-marca-600"><IconCheck size={16} /> Devolución completa</span>
          ) : null}
        </div>
        {quienTiene.length > 0 && <p className="mt-2 text-[14px] text-gris">Los tiene: <b className="text-tinta">{[...new Set(quienTiene)].join(", ")}</b></p>}

        {r.filas.length === 0 ? (
          <p className="mt-3 text-[15px] text-gris">Esta actividad no pidió elementos. Igual se puede registrar una entrega.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {r.filas.map((f) => <Elemento key={f.elemento} f={f} />)}
          </ul>
        )}
      </section>

      {/* Acciones principales */}
      {puedeGestionar && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => { setAviso(""); setHoja("ENTREGA"); }} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-marca text-[17px] font-extrabold tracking-wide text-white uppercase shadow-sm hover:bg-marca-600 active:scale-[0.99]">
            <IconGazebo size={22} /> Entregar
          </button>
          <button
            type="button"
            disabled={r.enCirculacion === 0}
            onClick={() => { setAviso(""); setHoja("DEVOLUCION"); }}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-petroleo text-[17px] font-extrabold tracking-wide text-white uppercase shadow-sm hover:bg-petroleo-600 active:scale-[0.99] disabled:bg-linea disabled:text-gris"
          >
            <IconCheck size={22} /> Registrar devolución
          </button>
          {!r.preparando && r.entregado === 0 && (
            <button type="button" disabled={pending} onClick={() => ejecutar(() => preparandoAction(actividadId))} className="min-h-11 rounded-2xl text-[15px] font-bold text-petroleo ring-1 ring-linea hover:bg-white sm:col-span-2">
              Marcar como «preparando»
            </button>
          )}
        </div>
      )}
      {aviso && <p role="status" className="rounded-xl bg-white px-3 py-2 text-[14px] font-semibold ring-1 ring-linea">{aviso}</p>}

      {/* Historial: nunca se borra */}
      <section className="rounded-[22px] bg-white p-4 ring-1 ring-linea/70">
        <h2 className="mb-2 text-[17px] font-extrabold">Historial</h2>
        {historial.length === 0 ? (
          <p className="text-[15px] text-gris">Todavía no hay movimientos.</p>
        ) : (
          <ol className="space-y-3">
            {historial.map((l) => (
              <li key={l.lote} className={cx("rounded-2xl p-3", l.anulado ? "bg-fondo opacity-60" : l.tipo === "ENTREGA" ? "bg-verde-50/60" : l.tipo === "DEVOLUCION" ? "bg-petroleo-50/60" : "bg-fondo")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={cx("text-[15px] font-extrabold", l.anulado && "line-through")}>
                    <IconClock size={15} className="mr-1 inline text-gris" />
                    {fechaHoraCorta(l.fecha_hora)} · {l.tipo === "ENTREGA" ? "Entrega" : l.tipo === "DEVOLUCION" ? "Devolución" : "Preparando"}
                  </p>
                  {l.anulado ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-bold text-gris">ANULADO</span>
                  ) : (
                    puedeGestionar && l.tipo !== "PREPARACION" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => confirm("¿Anular este registro? Queda en el historial pero deja de contar.") && ejecutar(() => anularLogisticaAction(actividadId, l.lote))}
                        className="text-[13px] font-bold text-gris hover:text-peligro hover:underline"
                      >
                        Anular
                      </button>
                    )
                  )}
                </div>
                {l.items.length > 0 && (
                  <ul className={cx("mt-1 text-[15px]", l.anulado && "line-through")}>
                    {l.items.map((i) => (
                      <li key={i.elemento}>
                        • {i.cantidad} {i.elemento.toLowerCase()}
                        {i.estado && i.estado !== "BIEN" && <span className="font-bold text-alerta"> ({ESTADO_ELEMENTO_LABEL[i.estado]})</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[13.5px] text-gris">
                  {l.persona && <>{l.tipo === "ENTREGA" ? "Recibió" : "Devolvió"}: <b className="text-tinta">{l.persona}</b> · </>}
                  Registró: {l.usuario}
                </p>
                {l.observaciones && <p className="mt-1 text-[14px] italic">{l.observaciones}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {hoja && (
        <HojaMovimiento
          tipo={hoja}
          resumen={r}
          sugeridos={sugeridos}
          ahora={ahora}
          onClose={() => setHoja(null)}
          onGuardado={(msg) => { setHoja(null); setAviso(msg); router.refresh(); }}
          actividadId={actividadId}
        />
      )}
    </div>
  );
}

/** Una fila: pedido / entregado / devuelto y qué falta, con un estado claro. */
function Elemento({ f }: { f: FilaLogistica }) {
  const chips: ReactNode[] = [];
  if (f.porEntregar > 0) chips.push(<span key="e" className="rounded-full bg-[#eef1f5] px-2.5 py-1 text-[12.5px] font-extrabold text-[#4a5568]">Faltan entregar {f.porEntregar}</span>);
  if (f.enCirculacion > 0) chips.push(<span key="d" className="rounded-full bg-alerta-50 px-2.5 py-1 text-[12.5px] font-extrabold text-alerta">⚠ {f.enCirculacion} sin devolver</span>);
  if (!chips.length && f.entregado > 0) chips.push(<span key="ok" className="rounded-full bg-verde-50 px-2.5 py-1 text-[12.5px] font-extrabold text-marca-600">✓ Completo</span>);
  const chip = chips.length ? <span className="flex shrink-0 flex-col items-end gap-1">{chips}</span> : null;
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-fondo px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[16px] font-bold">{f.elemento}</p>
        <p className="text-[13.5px] text-gris tabular-nums">
          {f.solicitado > 0 ? `Pedido ${f.solicitado}` : "No se había pedido"} · Entregado {f.entregado} · Devuelto {f.devuelto}
        </p>
      </div>
      {chip}
    </li>
  );
}

const inputCls = "block h-12 w-full rounded-xl border border-linea bg-white px-3 text-[16px] focus:border-petroleo focus:outline-none";

/** Hoja (bottom sheet) para registrar una entrega o una devolución: cantidades con +/−, quién, cuándo. */
function HojaMovimiento({
  tipo, resumen: r, sugeridos, ahora, onClose, onGuardado, actividadId,
}: {
  tipo: "ENTREGA" | "DEVOLUCION";
  resumen: ResumenLogistico;
  sugeridos: string[];
  ahora: string;
  onClose: () => void;
  onGuardado: (msg: string) => void;
  actividadId: string;
}) {
  const entrega = tipo === "ENTREGA";
  // Entrega: lo pedido (por defecto, lo que falta entregar). Devolución: lo que está afuera (por defecto, todo).
  const inicial = entrega
    ? r.filas.filter((f) => f.solicitado > 0).map((f) => ({ elemento: f.elemento, cantidad: f.porEntregar, max: 999, estado: "" }))
    : r.filas.filter((f) => f.enCirculacion > 0).map((f) => ({ elemento: f.elemento, cantidad: f.enCirculacion, max: f.enCirculacion, estado: "BIEN" }));
  const [items, setItems] = useState(inicial);
  const [persona, setPersona] = useState(entrega ? sugeridos[0] ?? "" : r.filas.flatMap((f) => f.quienTiene)[0] ?? "");
  const [fecha, setFecha] = useState(ahora);
  const [obs, setObs] = useState("");
  const [verObs, setVerObs] = useState(false);
  const [otro, setOtro] = useState("");
  const [error, setError] = useState<{ msg: string; campos: Record<string, string> }>({ msg: "", campos: {} });
  const [pending, start] = useTransition();

  const cambiar = (i: number, n: number) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, cantidad: Math.max(0, Math.min(x.max, n)) } : x)));
  const agregar = (elemento: string) => {
    const e = elemento.trim();
    if (!e || items.some((x) => x.elemento.toLowerCase() === e.toLowerCase())) return;
    setItems((xs) => [...xs, { elemento: e, cantidad: 1, max: 999, estado: "" }]);
    setOtro("");
  };
  const total = items.reduce((n, x) => n + x.cantidad, 0);

  function guardar() {
    start(async () => {
      const res = await movimientoLogisticaAction(actividadId, tipo, {
        items: items.map((x) => ({ elemento: x.elemento, cantidad: x.cantidad, estado: x.estado })),
        persona,
        fecha_hora: fecha,
        observaciones: obs,
      });
      if (res.ok) onGuardado(res.message ?? "Listo.");
      else setError({ msg: res.message ?? "No se pudo guardar.", campos: res.fields ?? {} });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={entrega ? "Registrar entrega" : "Registrar devolución"} onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-5 pb-8 shadow-xl sm:rounded-[28px]" style={{ animation: "aparecer .18s ease-out" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-titulo text-[20px] font-extrabold text-petroleo-600">{entrega ? "Registrar entrega" : "Registrar devolución"}</h2>
          <button type="button" onClick={onClose} className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-full text-gris hover:bg-fondo" aria-label="Cerrar"><IconX /></button>
        </div>

        <p className="mb-2 text-[14px] font-bold text-gris">{entrega ? "¿Qué se entrega?" : "¿Qué vuelve?"}</p>
        <ul className="space-y-2">
          {items.map((x, i) => (
            <li key={x.elemento} className="rounded-2xl bg-fondo px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-[16px] font-bold">{x.elemento}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => cambiar(i, x.cantidad - 1)} className="flex size-11 items-center justify-center rounded-xl bg-white text-[22px] font-bold ring-1 ring-linea" aria-label={`Menos ${x.elemento}`}>−</button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={x.max}
                    value={x.cantidad}
                    onChange={(e) => cambiar(i, Number(e.target.value) || 0)}
                    className="h-11 w-14 rounded-xl border border-linea bg-white text-center text-[17px] font-extrabold tabular-nums"
                    aria-label={`Cantidad de ${x.elemento}`}
                  />
                  <button type="button" onClick={() => cambiar(i, x.cantidad + 1)} className="flex size-11 items-center justify-center rounded-xl bg-white text-[22px] font-bold ring-1 ring-linea" aria-label={`Más ${x.elemento}`}>+</button>
                </div>
              </div>
              {!entrega && (
                <div className="mt-2 flex gap-1.5" role="group" aria-label={`Estado de ${x.elemento}`}>
                  {(["BIEN", "DAÑADO", "INCOMPLETO"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setItems((xs) => xs.map((y, j) => (j === i ? { ...y, estado: e } : y)))}
                      aria-pressed={x.estado === e}
                      className={cx("h-9 flex-1 rounded-lg text-[13px] font-bold", x.estado === e ? (e === "BIEN" ? "bg-marca text-white" : "bg-alerta text-white") : "bg-white ring-1 ring-linea")}
                    >
                      {ESTADO_ELEMENTO_LABEL[e]}
                    </button>
                  ))}
                </div>
              )}
              {!entrega && <p className="mt-1 text-[12.5px] text-gris">Afuera: {x.max}</p>}
            </li>
          ))}
        </ul>

        {entrega && (
          <div className="mt-3">
            <p className="mb-1.5 text-[13px] font-bold text-gris">Agregar otro elemento</p>
            <div className="flex flex-wrap gap-1.5">
              {ELEMENTOS_COMUNES.filter((e) => e !== "Otros" && !items.some((x) => x.elemento.toLowerCase() === e.toLowerCase())).map((e) => (
                <button key={e} type="button" onClick={() => agregar(e)} className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3 text-[13.5px] font-bold text-petroleo ring-1 ring-linea">
                  <IconPlus size={14} /> {e}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Otro (ej. Caballete)" className={inputCls} aria-label="Otro elemento" />
              <button type="button" onClick={() => agregar(otro)} disabled={!otro.trim()} className="shrink-0 rounded-xl px-4 font-bold text-petroleo ring-1 ring-linea disabled:opacity-50">Agregar</button>
            </div>
          </div>
        )}
        {error.campos.items && <p className="mt-2 text-[14px] font-semibold text-peligro">{error.campos.items}</p>}

        <label className="mt-4 mb-1.5 block text-[14px] font-bold text-gris" htmlFor="persona">{entrega ? "¿Quién recibe?" : "¿Quién devuelve?"}</label>
        <input id="persona" list="personas-log" value={persona} onChange={(e) => setPersona(e.target.value)} className={inputCls} placeholder="Nombre y apellido" autoComplete="off" />
        <datalist id="personas-log">{sugeridos.map((p) => <option key={p} value={p} />)}</datalist>
        {error.campos.persona && <p className="mt-1 text-[14px] font-semibold text-peligro">{error.campos.persona}</p>}

        <label className="mt-3 mb-1.5 block text-[14px] font-bold text-gris" htmlFor="fecha-log">Fecha y hora</label>
        <input id="fecha-log" type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />

        {verObs ? (
          <>
            <label className="mt-3 mb-1.5 block text-[14px] font-bold text-gris" htmlFor="obs-log">Observaciones</label>
            <textarea id="obs-log" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} className={`${inputCls} h-auto py-2`} />
          </>
        ) : (
          <button type="button" onClick={() => setVerObs(true)} className="mt-3 text-[14px] font-bold text-petroleo hover:underline">+ Agregar observación</button>
        )}

        {error.msg && !Object.keys(error.campos).length && <p role="alert" className="mt-3 rounded-xl bg-peligro-50 px-3 py-2 text-[14px] font-semibold text-peligro">{error.msg}</p>}

        <button
          type="button"
          onClick={guardar}
          disabled={pending || total === 0}
          className={cx("mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-extrabold text-white uppercase disabled:opacity-60", entrega ? "bg-marca hover:bg-marca-600" : "bg-petroleo hover:bg-petroleo-600")}
        >
          <IconCheck size={22} /> {pending ? "Guardando…" : entrega ? `Registrar entrega (${total})` : `Registrar devolución (${total})`}
        </button>
      </div>
    </div>
  );
}
