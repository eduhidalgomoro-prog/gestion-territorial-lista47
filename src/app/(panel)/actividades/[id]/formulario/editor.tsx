"use client";

import { useState, useTransition } from "react";
import { IconCheck, IconEye, IconLock, IconPlus, IconX } from "@/components/icons";
import { btn, cx } from "@/components/ui";
import { PREGUNTAS_FIJAS, type PreguntaFija } from "@/lib/inscripcion-publica";
import type { FormularioInput, PreguntaEditable } from "@/lib/services/actividades";
import { editarFormularioAction } from "../../../actions";

const DATOS_FIJOS = ["Nombre y apellido", "DNI", "Ciudad o localidad y barrio", "Dirección", "Fecha de nacimiento", "WhatsApp", "Aceptación del uso de datos"];
const TIPOS: [PreguntaEditable["tipo"], string][] = [["libre", "Respuesta libre"], ["sino", "Sí / No"], ["opciones", "Opciones"]];
const inputCls = "block min-h-12 w-full rounded-xl border border-linea bg-white px-3.5 text-[16px] focus:border-petroleo focus:outline-none aria-[invalid=true]:border-peligro";

/**
 * Editor del formulario de inscripción: datos personales fijos (bloqueados), preguntas de la Escuela
 * que se pueden sacar, preguntas propias (agregar, cambiar, ordenar, borrar), bienvenida y cupo.
 */
export function EditorFormulario({
  actividadId, slug, escuela, inicial, bienvenidaPorDefecto,
}: {
  actividadId: string;
  slug: string;
  escuela: boolean;
  inicial: FormularioInput;
  bienvenidaPorDefecto: string;
}) {
  const [sin, setSin] = useState<string[]>(inicial.sin);
  const [preguntas, setPreguntas] = useState<PreguntaEditable[]>(inicial.preguntas);
  const [bienvenida, setBienvenida] = useState(inicial.bienvenida);
  const [cupo, setCupo] = useState(inicial.cupo ? String(inicial.cupo) : "");
  const [res, setRes] = useState<{ ok: boolean; message?: string; fields?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();

  const cambiar = (i: number, p: Partial<PreguntaEditable>) => setPreguntas((qs) => qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const mover = (i: number, d: -1 | 1) =>
    setPreguntas((qs) => {
      const n = [...qs];
      const j = i + d;
      if (j < 0 || j >= n.length) return qs;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const alternar = (id: PreguntaFija) => setSin((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function guardar() {
    setRes(null);
    start(async () => {
      const r = await editarFormularioAction(actividadId, { sin, preguntas, bienvenida, cupo: cupo.trim() ? Number(cupo) : null });
      setRes(r);
    });
  }

  const err = res?.fields ?? {};

  return (
    <div className="space-y-4">
      {/* Datos personales: siempre */}
      <section className="rounded-[22px] bg-white p-4 ring-1 ring-linea/70 sm:p-5">
        <h2 className="flex items-center gap-2 text-[16px] font-extrabold"><IconLock size={18} className="text-gris" /> Datos de la persona</h2>
        <p className="mt-0.5 text-[14px] text-gris">Se piden siempre: con estos datos se registra a la persona y se la puede contactar.</p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {DATOS_FIJOS.map((d) => (
            <li key={d} className="rounded-full bg-fondo px-3 py-1.5 text-[13.5px] font-semibold text-gris">{d}</li>
          ))}
        </ul>
      </section>

      {/* Preguntas de la Escuela: se pueden sacar */}
      {escuela && (
        <section className="rounded-[22px] bg-white p-4 ring-1 ring-linea/70 sm:p-5">
          <h2 className="text-[16px] font-extrabold">Preguntas de la Escuela</h2>
          <p className="mt-0.5 text-[14px] text-gris">Apagá las que no tengan sentido para esta actividad.</p>
          <ul className="mt-3 space-y-2">
            {PREGUNTAS_FIJAS.map((p) => {
              const on = !sin.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => alternar(p.id)}
                    className={cx("flex w-full items-start gap-3 rounded-2xl p-3 text-left ring-1 transition-colors", on ? "bg-verde-50 ring-marca/30" : "bg-fondo ring-linea")}
                  >
                    <span className={cx("mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-marca" : "bg-[#c5ced6]")} aria-hidden>
                      <span className={cx("size-6 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
                    </span>
                    <span className="min-w-0">
                      <span className={cx("block text-[15.5px] leading-snug font-bold", !on && "text-gris line-through decoration-gris/50")}>{p.texto}</span>
                      <span className="block text-[13.5px] text-gris">{on ? p.detalle : "No se pregunta en este formulario."}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Preguntas propias */}
      <section className="rounded-[22px] bg-white p-4 ring-1 ring-linea/70 sm:p-5">
        <h2 className="text-[16px] font-extrabold">Preguntas propias de esta actividad</h2>
        <p className="mt-0.5 text-[14px] text-gris">Agregá lo que necesites saber. Son optativas para quien se inscribe.</p>
        {preguntas.length === 0 && <p className="mt-3 rounded-2xl bg-fondo p-3 text-[14.5px] text-gris">Todavía no hay preguntas propias.</p>}
        <ol className="mt-3 space-y-3">
          {preguntas.map((q, i) => (
            <li key={i} className={cx("rounded-2xl bg-fondo p-3", err[`pregunta-${i}`] && "ring-2 ring-peligro/50")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-extrabold tracking-wide text-petroleo uppercase">Pregunta {i + 1}</span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="flex size-9 items-center justify-center rounded-lg bg-white text-[16px] font-bold ring-1 ring-linea disabled:opacity-40" aria-label={`Subir la pregunta ${i + 1}`}>↑</button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === preguntas.length - 1} className="flex size-9 items-center justify-center rounded-lg bg-white text-[16px] font-bold ring-1 ring-linea disabled:opacity-40" aria-label={`Bajar la pregunta ${i + 1}`}>↓</button>
                  <button type="button" onClick={() => setPreguntas((qs) => qs.filter((_, j) => j !== i))} className="flex size-9 items-center justify-center rounded-lg bg-white text-peligro ring-1 ring-linea" aria-label={`Borrar la pregunta ${i + 1}`}><IconX size={17} /></button>
                </span>
              </div>
              <input
                value={q.texto}
                onChange={(e) => cambiar(i, { texto: e.target.value })}
                placeholder="Ej: ¿Traés tus propios materiales?"
                maxLength={200}
                className={cx(inputCls, "mt-2")}
                aria-label={`Texto de la pregunta ${i + 1}`}
              />
              <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={`Tipo de respuesta de la pregunta ${i + 1}`}>
                {TIPOS.map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={q.tipo === t}
                    onClick={() => cambiar(i, { tipo: t, opciones: t === "opciones" && q.opciones.length < 2 ? ["", ""] : q.opciones })}
                    className={cx("min-h-10 rounded-xl text-[13.5px] font-bold ring-1", q.tipo === t ? "bg-petroleo text-white ring-petroleo" : "bg-white ring-linea")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {q.tipo === "opciones" && (
                <div className="mt-2 space-y-1.5">
                  {q.opciones.map((o, k) => (
                    <div key={k} className="flex gap-1.5">
                      <input
                        value={o}
                        onChange={(e) => cambiar(i, { opciones: q.opciones.map((x, m) => (m === k ? e.target.value : x)) })}
                        placeholder={`Opción ${k + 1}`}
                        maxLength={60}
                        className={inputCls}
                        aria-label={`Opción ${k + 1} de la pregunta ${i + 1}`}
                      />
                      <button type="button" onClick={() => cambiar(i, { opciones: q.opciones.filter((_, m) => m !== k) })} className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white text-gris ring-1 ring-linea" aria-label={`Quitar la opción ${k + 1}`}><IconX size={16} /></button>
                    </div>
                  ))}
                  {q.opciones.length < 8 && (
                    <button type="button" onClick={() => cambiar(i, { opciones: [...q.opciones, ""] })} className="inline-flex min-h-10 items-center gap-1 text-[14px] font-bold text-petroleo">
                      <IconPlus size={16} /> Agregar opción
                    </button>
                  )}
                </div>
              )}
              {q.tipo === "sino" && <p className="mt-2 text-[13.5px] text-gris">Se responde con dos botones grandes: Sí y No.</p>}
              {err[`pregunta-${i}`] && <p className="mt-2 text-[14px] font-semibold text-peligro">{err[`pregunta-${i}`]}</p>}
            </li>
          ))}
        </ol>
        {err.preguntas && <p className="mt-2 text-[14px] font-semibold text-peligro">{err.preguntas}</p>}
        {preguntas.length < 15 && (
          <button
            type="button"
            onClick={() => setPreguntas((qs) => [...qs, { texto: "", tipo: "libre", opciones: [] }])}
            className={cx(btn("secundario", "md"), "mt-3 w-full")}
          >
            <IconPlus size={18} /> Agregar pregunta
          </button>
        )}
      </section>

      {/* Bienvenida y cupo */}
      <section className="rounded-[22px] bg-white p-4 ring-1 ring-linea/70 sm:p-5">
        <label htmlFor="bienvenida" className="block text-[16px] font-extrabold">Mensaje de bienvenida <span className="font-normal text-gris">(opcional)</span></label>
        <input id="bienvenida" value={bienvenida} onChange={(e) => setBienvenida(e.target.value)} maxLength={120} placeholder={bienvenidaPorDefecto} className={cx(inputCls, "mt-2")} />
        <p className="mt-1 text-[13.5px] text-gris">Es el título grande antes de los datos. Vacío = «{bienvenidaPorDefecto}».</p>

        <label htmlFor="cupo" className="mt-4 block text-[16px] font-extrabold">Cupo de participantes <span className="font-normal text-gris">(opcional)</span></label>
        <input id="cupo" type="number" inputMode="numeric" min={1} max={5000} value={cupo} onChange={(e) => setCupo(e.target.value)} aria-invalid={!!err.cupo} className={cx(inputCls, "mt-2 max-w-40")} />
        <p className={cx("mt-1 text-[13.5px]", err.cupo ? "font-semibold text-peligro" : "text-gris")}>
          {err.cupo ?? "Vacío = sin límite. Con el cupo completo, el formulario anota en lista de espera."}
        </p>
      </section>

      {/* Guardar */}
      <div className="sticky bottom-20 z-10 rounded-[22px] bg-white/95 p-3 shadow-[0_-2px_12px_rgba(16,105,133,0.10)] ring-1 ring-linea backdrop-blur lg:bottom-4">
        {res && (
          <p role="status" className={cx("mb-2 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[14.5px] font-semibold", res.ok ? "bg-verde-50 text-marca-600" : "bg-peligro-50 text-peligro")}>
            {res.ok && <IconCheck size={18} />} {res.message}
          </p>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={guardar} disabled={pending} className={cx(btn("primario", "lg"), "w-full")}>
            {pending ? "Guardando…" : "Guardar formulario"}
          </button>
          {slug ? (
            <a href={`/inscripcion/${slug}`} target="_blank" rel="noopener noreferrer" className={btn("secundario", "lg")} aria-label="Ver el formulario como lo ve la gente">
              <IconEye size={20} /> <span className="max-sm:sr-only">Ver formulario</span>
            </a>
          ) : null}
        </div>
        {!slug && <p className="mt-2 text-[13.5px] text-gris">El link público se crea cuando generás el formulario desde la ficha.</p>}
      </div>
    </div>
  );
}
