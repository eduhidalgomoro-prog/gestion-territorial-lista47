"use client";

import { useState, useTransition } from "react";
import { IconCheck, IconChecklist, IconEye } from "@/components/icons";
import { cx } from "@/components/ui";
import { CHECKLIST_VISUAL, GUIA_VISUAL_PDF, IDS_CHECKLIST_VISUAL } from "@/lib/guias";
import { checklistAction } from "@/app/(panel)/actions";

/**
 * Guía del operativo de salud visual en la ficha: lo que hay que tener listo antes, para ir tildando.
 * Se guarda al tocar (si falla, vuelve atrás y avisa). Quien no puede editar la ve como lista de control.
 */
export function GuiaOperativo({ actividadId, hechos: inicial, editable }: { actividadId: string; hechos: string[]; editable: boolean }) {
  const [hechos, setHechos] = useState(() => new Set(inicial));
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const total = IDS_CHECKLIST_VISUAL.length;
  const listos = IDS_CHECKLIST_VISUAL.filter((id) => hechos.has(id)).length;
  const completo = listos === total;

  function tildar(id: string) {
    const hecho = !hechos.has(id);
    const cambiar = (h: boolean) =>
      setHechos((s) => {
        const n = new Set(s);
        if (h) n.add(id);
        else n.delete(id);
        return n;
      });
    cambiar(hecho);
    setError("");
    start(async () => {
      const r = await checklistAction(actividadId, id, hecho);
      if (!r.ok) {
        cambiar(!hecho);
        setError(r.message ?? "No se pudo guardar. Probá de nuevo.");
      }
    });
  }

  return (
    <details open={!completo} className="group rounded-[22px] bg-white shadow-[0_1px_2px_rgba(16,105,133,0.06)] ring-1 ring-linea/70">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-full", completo ? "bg-marca text-white" : "bg-petroleo-50 text-petroleo")} aria-hidden>
          {completo ? <IconCheck size={22} strokeWidth={2.6} /> : <IconChecklist size={22} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-extrabold">Guía del operativo</span>
          <span className={cx("block text-[14px] font-semibold", completo ? "text-marca-600" : "text-gris")}>
            {completo ? "¡Todo listo!" : `${listos} de ${total} listos`}
          </span>
          <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-fondo" role="progressbar" aria-valuenow={listos} aria-valuemin={0} aria-valuemax={total} aria-label={`${listos} de ${total} listos`}>
            <span className="block h-full rounded-full bg-verde transition-[width] duration-300" style={{ width: `${(listos / total) * 100}%` }} />
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="shrink-0 text-gris transition-transform group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
      </summary>

      <div className="border-t border-linea px-4 pt-3 pb-4">
        {CHECKLIST_VISUAL.map((g) => (
          <fieldset key={g.grupo} className="mb-3">
            <legend className="mb-1.5 text-[12.5px] font-extrabold tracking-[0.12em] text-petroleo uppercase">{g.grupo}</legend>
            <ul className="space-y-1.5">
              {g.items.map((it) => {
                const ok = hechos.has(it.id);
                return (
                  <li key={it.id}>
                    <label className={cx("flex min-h-12 items-start gap-3 rounded-2xl px-3 py-2.5", editable && "cursor-pointer", ok ? "bg-verde-50" : "bg-fondo")}>
                      <input type="checkbox" checked={ok} disabled={!editable} onChange={() => tildar(it.id)} className="mt-0.5 size-5 shrink-0 accent-marca" />
                      <span className="min-w-0">
                        <span className={cx("block text-[15.5px] leading-snug font-bold", ok && "text-marca-600")}>{it.texto}</span>
                        {it.detalle && <span className="block text-[13.5px] text-gris">{it.detalle}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
        {error && <p role="alert" className="mb-2 rounded-xl bg-peligro-50 px-3 py-2 text-[14px] font-semibold text-peligro">{error}</p>}
        <p className="text-[14px] text-gris">
          Y lo más importante: recibir con una sonrisa, escuchar con paciencia y acompañar a cada persona en todo el recorrido.
        </p>
        <a href={GUIA_VISUAL_PDF} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-petroleo-50 px-4 text-[14.5px] font-bold text-petroleo hover:underline">
          <IconEye size={18} /> Ver la guía completa
        </a>
      </div>
    </details>
  );
}
