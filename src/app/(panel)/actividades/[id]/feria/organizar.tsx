"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { agregarPuestoAction, asignarPuestoAction, eliminarPuestoAction, intercambiarPuestosAction, invertirSectorAction, tipoPuestoAction } from "@/app/(panel)/actions";
import { IconPlus, IconX } from "@/components/icons";
import { cx } from "@/components/ui";
import { armarFilas, CAPACIDAD, enPantalla, FILA_NUEVA, TIPO_PUESTO_FONDO, TIPO_PUESTO_HEX, TIPO_PUESTO_LABEL } from "@/lib/ferias";
import { TIPOS_PUESTO, type TipoPuesto } from "@/lib/schema";

export interface PuestoTablero {
  numero: number;
  tipo: TipoPuesto;
  sector: string;
}

export interface FerianteTablero {
  id: string;
  nombre: string;
  emprendimiento: string;
  puesto: number;
}

const CORTO: Record<TipoPuesto, string> = { INDIVIDUAL: "Individual", COMPARTIDO: "Compartido", PROPIO: "Gazebo propio" };

/**
 * Organizar lugares después de la asignación: tocar una feriante y después el puesto al que va
 * (si está ocupado, se cambian de lugar). Cada puesto se puede cambiar de tipo o sacar, y cada fila suma puestos.
 */
export function OrganizarPuestos({ actividadId, puestos, feriantes, invertidos = "" }: { actividadId: string; puestos: PuestoTablero[]; feriantes: FerianteTablero[]; invertidos?: string }) {
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  const filas = armarFilas(puestos, invertidos);
  const columnas = Math.max(...filas.map((f) => f.puestos.length + 1), 4); // +1: el botón «+ Puesto»
  const porPuesto = new Map<number, FerianteTablero[]>();
  for (const f of feriantes) if (f.puesto) porPuesto.set(f.puesto, [...(porPuesto.get(f.puesto) ?? []), f]);
  const sinPuesto = feriantes.filter((f) => !f.puesto || !puestos.some((p) => p.numero === f.puesto));
  const elegida = feriantes.find((f) => f.id === sel);
  const menuPuesto = puestos.find((p) => p.numero === menu);
  const menuOcupantes = menuPuesto ? porPuesto.get(menuPuesto.numero) ?? [] : [];

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ t: r.message ?? (r.ok ? "Listo." : "No se pudo guardar."), ok: r.ok });
      setSel(null);
      setMenu(null);
      if (r.ok) router.refresh();
    });

  /** Con una feriante elegida: tocar un puesto la mueve ahí (si hay lugar). */
  function tocarPuesto(p: PuestoTablero) {
    if (!elegida) return setMenu(menu === p.numero ? null : p.numero);
    const ahi = porPuesto.get(p.numero) ?? [];
    if (elegida.puesto === p.numero) return setSel(null);
    if (ahi.length < CAPACIDAD[p.tipo]) return run(() => asignarPuestoAction(elegida.id, p.numero));
    // Lleno y con una sola persona: se cambian de lugar.
    if (ahi.length === 1) return run(() => intercambiarPuestosAction(elegida.id, ahi[0].id));
    setMsg({ t: "Ese gazebo está completo: tocá a la persona con la que se cambia de lugar.", ok: false });
  }

  /** Tocar a una feriante: la elige; si ya había otra elegida, se cambian de lugar. */
  function tocarFeriante(f: FerianteTablero) {
    setMenu(null);
    if (!sel) return setSel(f.id);
    if (sel === f.id) return setSel(null);
    run(() => intercambiarPuestosAction(sel, f.id));
  }

  const Chip = ({ f }: { f: FerianteTablero }) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        tocarFeriante(f);
      }}
      disabled={pending}
      className={cx(
        "block w-full rounded-md px-1 py-0.5 text-[11.5px] leading-tight font-semibold break-words",
        sel === f.id ? "bg-amber-300 text-tinta ring-2 ring-amber-500" : "bg-white/80 text-tinta hover:bg-white",
      )}
      title={`${f.nombre} · ${f.emprendimiento}`}
    >
      {f.emprendimiento || f.nombre}
    </button>
  );

  const MasPuesto = ({ fila }: { fila: (typeof filas)[number] }) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => agregarPuestoAction(actividadId, fila.sector, fila.puestos[fila.puestos.length - 1].tipo))}
      className="flex min-h-28 min-w-0 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-linea text-[12px] font-bold text-petroleo hover:border-petroleo"
      aria-label={`Agregar un puesto al sector ${fila.sector}`}
    >
      <IconPlus size={18} /> Puesto
    </button>
  );

  return (
    <section className="rounded-2xl border border-linea bg-white p-3 sm:p-4">
      <h2 className="text-lg font-bold">Organizar lugares</h2>
      <p className="mb-3 text-sm text-gris">
        Tocá un emprendimiento y después el puesto al que lo querés mover. Si tocás otro emprendimiento, se cambian de lugar. Tocá un puesto (sin nada elegido) para cambiarle el tipo o sacarlo.
      </p>

      {(elegida || msg) && (
        <div className={cx("sticky top-16 z-10 mb-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold lg:top-2", elegida ? "bg-amber-100 text-tinta" : msg?.ok ? "bg-verde-50 text-marca-600" : "bg-peligro-50 text-peligro")} role="status">
          <span>{elegida ? <>Moviendo a <b>{elegida.emprendimiento || elegida.nombre}</b>: tocá el puesto de destino o a quien se cambia con ella.</> : msg?.t}</span>
          {elegida && (
            <button type="button" onClick={() => setSel(null)} className="shrink-0 rounded-full bg-white px-3 py-1 text-[13px] font-bold ring-1 ring-linea">Cancelar</button>
          )}
        </div>
      )}

      {/* En la PC entra todo a lo ancho (los puestos se achican); en el celular se desliza de costado. */}
      <div className="overflow-x-auto">
        <div className="min-w-(--ancho) space-y-4 lg:min-w-0" style={{ "--ancho": `${columnas * 64}px` } as CSSProperties}>
          {filas.map((fila) => (
            <div key={fila.sector}>
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-sm font-extrabold" style={{ color: TIPO_PUESTO_HEX[fila.tipo] }}>
                  Sector {fila.sector}{" "}
                  <span className="font-semibold text-gris">
                    · {fila.invertida ? `del ${fila.puestos[fila.puestos.length - 1].numero} al ${fila.puestos[0].numero} (al revés)` : `del ${fila.puestos[0].numero} al ${fila.puestos[fila.puestos.length - 1].numero}`}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => invertirSectorAction(actividadId, fila.sector))}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-bold text-petroleo ring-1 ring-linea hover:ring-petroleo"
                  title="Dar vuelta el sentido de la fila (numeración tipo gusanito)"
                >
                  ⇄ {fila.invertida ? "Poner derecho" : "Dar vuelta"}
                </button>
              </div>
              {/* Todas las filas en las mismas columnas: así el «gusanito» queda alineado. */}
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
                {enPantalla(fila).map((p) => {
                  const ahi = porPuesto.get(p.numero) ?? [];
                  const libres = CAPACIDAD[p.tipo] - ahi.length;
                  const destino = !!elegida && elegida.puesto !== p.numero && (libres > 0 || ahi.length === 1);
                  return (
                    <div key={p.numero} className="relative min-w-0">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => tocarPuesto(p)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && tocarPuesto(p)}
                        aria-label={`Puesto ${p.numero}, ${TIPO_PUESTO_LABEL[p.tipo]}${ahi.length ? `: ${ahi.map((f) => f.emprendimiento).join(" y ")}` : ", libre"}`}
                        className={cx("flex min-h-28 cursor-pointer flex-col items-center gap-1 rounded-t-[40%] rounded-b-md border-2 px-1 pt-1.5 pb-1 text-center", destino && "ring-4 ring-amber-300", menu === p.numero && "ring-4 ring-petroleo/40")}
                        style={{ background: TIPO_PUESTO_FONDO[p.tipo], borderColor: TIPO_PUESTO_HEX[p.tipo] }}
                      >
                        <span className="font-titulo text-xl leading-none font-extrabold" style={{ color: TIPO_PUESTO_HEX[p.tipo] }}>{p.numero}</span>
                        {ahi.map((f) => <Chip key={f.id} f={f} />)}
                        {Array.from({ length: Math.max(0, libres) }, (_, i) => (
                          <span key={i} className="block w-full rounded-md border border-dashed border-gris/40 py-0.5 text-[11px] text-gris">libre</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <MasPuesto fila={fila} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Opciones del puesto tocado (debajo del tablero, así no las corta el desplazamiento lateral). */}
      {menuPuesto && !elegida && (
        <div className="mt-3 rounded-xl bg-fondo p-3 ring-1 ring-petroleo/30">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[14px] font-extrabold">
              Puesto N° {menuPuesto.numero}
              <span className="font-semibold text-gris"> · {menuOcupantes.length ? menuOcupantes.map((f) => f.emprendimiento || f.nombre).join(" y ") : "libre"}</span>
            </p>
            <button type="button" onClick={() => setMenu(null)} className="flex size-8 items-center justify-center rounded-full text-gris hover:bg-white" aria-label="Cerrar"><IconX size={16} /></button>
          </div>
          <p className="mb-1.5 text-[13px] font-bold text-gris">Tipo de puesto</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TIPOS_PUESTO.map((t) => (
              <button
                key={t}
                type="button"
                disabled={pending || t === menuPuesto.tipo}
                aria-pressed={t === menuPuesto.tipo}
                onClick={() => {
                  if (CAPACIDAD[t] < menuOcupantes.length && !confirm(`En un puesto ${CORTO[t].toLowerCase()} entra una sola persona: ${menuOcupantes[menuOcupantes.length - 1].emprendimiento} queda sin puesto. ¿Seguir?`)) return;
                  run(() => tipoPuestoAction(actividadId, menuPuesto.numero, t));
                }}
                className={cx("min-h-11 rounded-xl px-1 text-[13px] font-bold ring-1", t === menuPuesto.tipo ? "bg-petroleo text-white ring-petroleo" : "bg-white ring-linea")}
              >
                {CORTO[t]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`¿Sacar el puesto N° ${menuPuesto.numero}?${menuOcupantes.length ? ` ${menuOcupantes.map((f) => f.emprendimiento).join(" y ")} queda sin puesto.` : ""} Los números que siguen se corren uno.`)) return;
              run(() => eliminarPuestoAction(actividadId, menuPuesto.numero));
            }}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white text-[14px] font-bold text-peligro ring-1 ring-peligro/30 hover:bg-peligro-50"
          >
            <IconX size={16} /> Sacar este puesto
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {TIPOS_PUESTO.map((t) => (
          <button
            key={t}
            type="button"
            disabled={pending}
            onClick={() => run(() => agregarPuestoAction(actividadId, FILA_NUEVA, t))}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border border-dashed border-linea px-3 text-[13px] font-bold text-petroleo hover:border-petroleo"
          >
            <IconPlus size={15} /> Fila nueva: {CORTO[t].toLowerCase()}
          </button>
        ))}
      </div>

      {/* Bandeja: las que no tienen puesto (tocarla con alguien elegido la deja sin puesto). */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => elegida && elegida.puesto && run(() => asignarPuestoAction(elegida.id, 0))}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && elegida?.puesto && run(() => asignarPuestoAction(elegida.id, 0))}
        className={cx("mt-4 rounded-xl border-2 border-dashed p-3", elegida?.puesto ? "border-amber-400 bg-amber-50" : "border-linea bg-fondo")}
      >
        <p className="mb-2 text-sm font-extrabold text-gris">Sin puesto ({sinPuesto.length}){elegida?.puesto ? " · tocá acá para dejarla sin puesto" : ""}</p>
        {sinPuesto.length ? (
          <div className="flex flex-wrap gap-1.5">
            {sinPuesto.map((f) => (
              <div key={f.id} className="w-36"><Chip f={f} /></div>
            ))}
          </div>
        ) : (
          <p className="text-[13.5px] text-gris">Todas tienen lugar.</p>
        )}
      </div>
    </section>
  );
}
