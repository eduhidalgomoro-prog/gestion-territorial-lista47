"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { asignarPuestoAction, estadoFerianteAction, grupoFerianteAction } from "@/app/(panel)/actions";
import { esGrupo, GRUPO_UNO, GRUPOS_FERIA } from "@/lib/ferias-grupos";
import { IconoRubro } from "@/components/feria-ui";
import { IconWhatsApp } from "@/components/icons";
import { Badge, cx } from "@/components/ui";
import { CAPACIDAD, llevaGazebo, TIPO_PUESTO_HEX, TIPO_PUESTO_LABEL } from "@/lib/ferias";
import type { TipoPuesto } from "@/lib/schema";

export interface FilaFeriante {
  id: string;
  orden: number;
  nombre: string;
  telefono: string; // formateado ("" si el rol no lo ve)
  dni: string; // completo o tapado según el rol ("" si no tiene)
  emprendimiento: string;
  rubro: string;
  lleva: string;
  comparte: boolean;
  al_lado_de: string;
  vecina: string; // a quién se refiere «al lado de» (si se reconoció)
  puesto: number;
  activa: boolean;
  enEspera: boolean; // se anotó con el cupo completo
  faltas: number; // ferias anteriores en las que confirmó y no fue
  grupo: string; // ferias con cupo por grupos: ORIGINAL | ESPERA | EXTRA
  whatsapp: string; // link con el mensaje del puesto ("" si no hay teléfono o puesto)
}

const COLOR_GRUPO: Record<string, string> = { ORIGINAL: "bg-verde-50 text-marca-600 ring-marca/30", ESPERA: "bg-petroleo-50 text-petroleo-600 ring-petroleo/30", EXTRA: "bg-alerta-50 text-alerta ring-alerta/30" };

/** Lista de feriantes: ordenadas por inscripción, con el puesto para elegir y el aviso por WhatsApp. */
export function ListaFeriantes({ filas, puestos, editable, grupos = false }: { filas: FilaFeriante[]; puestos: { numero: number; tipo: TipoPuesto }[]; editable: boolean; grupos?: boolean }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ id: string; t: string; ok: boolean } | null>(null);
  const tipoDe = new Map(puestos.map((p) => [p.numero, p.tipo]));
  const ocupacion = new Map<number, number>();
  for (const f of filas) if (f.activa && f.puesto) ocupacion.set(f.puesto, (ocupacion.get(f.puesto) ?? 0) + 1);

  const run = (id: string, fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ id, t: r.message ?? (r.ok ? "Listo." : "No se pudo guardar."), ok: r.ok });
      if (r.ok) router.refresh();
    });

  return (
    <ul className="space-y-2">
      {filas.map((f) => {
        const tipo = tipoDe.get(f.puesto);
        return (
          <li key={f.id} className={cx("rounded-3xl border bg-white p-3 sm:p-4", f.activa || f.enEspera ? "border-linea" : "border-dashed border-linea opacity-60")}>
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex w-10 shrink-0 flex-col items-center gap-1">
                <span className="text-sm font-bold text-gris">{f.orden}</span>
                <span className="flex size-9 items-center justify-center rounded-full bg-petroleo-50 text-petroleo" title={f.rubro}>
                  <IconoRubro rubro={f.rubro} size={19} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-bold">
                  {f.nombre} {!f.activa && !f.enEspera && <Badge color="rojo">BAJA</Badge>}
                  {f.faltas > 0 && (
                    <span className="rounded-full bg-peligro-50 px-2 py-0.5 text-[12px] font-bold text-peligro" title="Confirmó y no fue a ferias anteriores">
                      Faltó a {f.faltas} feria{f.faltas === 1 ? "" : "s"}
                    </span>
                  )}
                  {grupos && f.activa && (
                    editable ? (
                      <select
                        aria-label={`Grupo de ${f.nombre}`}
                        value={f.grupo}
                        disabled={pendiente}
                        onChange={(e) => run(f.id, () => grupoFerianteAction(f.id, e.target.value))}
                        className={cx("h-7 rounded-full px-2 text-[12px] font-extrabold uppercase ring-1", COLOR_GRUPO[f.grupo] ?? "bg-fondo text-gris ring-linea")}
                      >
                        {!esGrupo(f.grupo) && <option value="">Sin grupo</option>}
                        {GRUPOS_FERIA.map((g) => <option key={g} value={g}>{GRUPO_UNO[g]}</option>)}
                      </select>
                    ) : (
                      <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-extrabold uppercase ring-1", COLOR_GRUPO[f.grupo] ?? "bg-fondo text-gris ring-linea")}>
                        {esGrupo(f.grupo) ? GRUPO_UNO[f.grupo] : "Sin grupo"}
                      </span>
                    )
                  )}
                </p>
                <p className="text-[15px]">
                  <b className="text-marca-600">{f.emprendimiento}</b>
                  {f.rubro && <span className="text-gris"> · {f.rubro}</span>}
                </p>
                <p className="mt-0.5 text-sm text-gris">
                  {[f.dni && `DNI ${f.dni}`, f.telefono, f.comparte ? "Puede compartir" : "No comparte", f.lleva && `Lleva: ${f.lleva}`].filter(Boolean).join(" · ")}
                </p>
                {f.al_lado_de && (
                  <p className="text-sm text-gris">
                    Quiere estar al lado de: <b className="text-tinta">{f.al_lado_de}</b>
                    {f.vecina && f.vecina !== f.al_lado_de && <span> ({f.vecina})</span>}
                  </p>
                )}
              </div>
              {f.activa && (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-end">
                  {editable ? (
                    <select
                      aria-label={`Puesto de ${f.nombre}`}
                      value={f.puesto || ""}
                      disabled={pendiente}
                      onChange={(e) => run(f.id, () => asignarPuestoAction(f.id, Number(e.target.value) || 0))}
                      className="h-11 min-w-44 rounded-xl border-2 bg-white px-2 font-bold"
                      style={{ borderColor: tipo ? TIPO_PUESTO_HEX[tipo] : undefined }}
                    >
                      <option value="">Sin puesto</option>
                      {puestos.map((p) => {
                        const usados = (ocupacion.get(p.numero) ?? 0) - (f.puesto === p.numero ? 1 : 0);
                        const lleno = usados >= CAPACIDAD[p.tipo];
                        // Avisos para elegir bien: trae gazebo y el puesto tiene, o no comparte y el puesto es compartido.
                        const ojo = (llevaGazebo(f.lleva) && p.tipo !== "PROPIO") || (!llevaGazebo(f.lleva) && p.tipo === "PROPIO") || (!f.comparte && p.tipo === "COMPARTIDO");
                        return (
                          <option key={p.numero} value={p.numero} disabled={lleno}>
                            N° {p.numero} · {TIPO_PUESTO_LABEL[p.tipo].replace("Gazebo ", "").replace("Con gazebo ", "")}
                            {p.tipo === "COMPARTIDO" ? ` (${usados}/2)` : ""}
                            {lleno ? " · completo" : ojo ? " · revisar" : ""}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <Badge color="petroleo">{f.puesto ? `Puesto N° ${f.puesto}` : "Sin puesto"}</Badge>
                  )}
                  {f.whatsapp && (
                    <a href={f.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#1f8f4e]/40 px-3 text-sm font-bold text-[#1f8f4e] hover:bg-[#1f8f4e]/5">
                      <IconWhatsApp size={18} /> Avisar su puesto
                    </a>
                  )}
                </div>
              )}
            </div>
            {editable && (
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-linea pt-2">
                {msg?.id === f.id ? <span className={cx("text-sm font-semibold", msg.ok ? "text-ok" : "text-peligro")}>{msg.t}</span> : <span />}
                {f.enEspera ? (
                  <span className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => confirm(`¿Sacar a ${f.nombre} de la lista de espera?`) && run(f.id, () => estadoFerianteAction(f.id, false))}
                      className="text-sm font-bold text-gris hover:underline"
                    >
                      Sacar de la lista
                    </button>
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => run(f.id, () => estadoFerianteAction(f.id, true))}
                      className="min-h-10 rounded-xl bg-marca px-3 text-sm font-bold text-white hover:bg-marca-600"
                    >
                      Pasar a inscripta
                    </button>
                  </span>
                ) : (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => {
                    if (f.activa && !confirm(`¿Dar de baja a ${f.nombre}? Se libera su lugar y su puesto.`)) return;
                    run(f.id, () => estadoFerianteAction(f.id, !f.activa));
                  }}
                  className={cx("text-sm font-bold hover:underline", f.activa ? "text-peligro" : "text-petroleo")}
                >
                  {f.activa ? "Dar de baja" : "Reincorporar"}
                </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
