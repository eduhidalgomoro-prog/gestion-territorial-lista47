import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { ubicacionLabel } from "@/lib/labels";
import { ahoraLocal, resumenLogistico } from "@/lib/logistica";
import { puede } from "@/lib/permisos";
import { nombreCorto } from "@/lib/taller-nombre";
import { formatDate, titleCase, today } from "@/lib/util";
import { LogisticaActividad, type Lote } from "./logistica-actividad";

export const metadata = { title: "Logística" };

/** Logística de una actividad: lo pedido, lo entregado, lo que volvió y el historial completo. */
export default async function LogisticaDeActividad({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requireUser();
  const { id } = await params;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  const r = resumenLogistico(a, s.requerimientos, s.logistica, today());

  // Historial: cada entrega/devolución (lote) con sus elementos; lo más reciente arriba.
  const porLote = new Map<string, Lote>();
  for (const m of s.logistica.filter((x) => x.actividad_id === id)) {
    let l = porLote.get(m.lote);
    if (!l) porLote.set(m.lote, (l = { lote: m.lote, tipo: m.tipo, fecha_hora: m.fecha_hora, persona: m.persona, usuario: m.usuario, observaciones: m.observaciones, anulado: m.anulado, items: [] }));
    if (m.elemento) l.items.push({ elemento: m.elemento, cantidad: m.cantidad, estado: m.estado_elemento });
  }
  const historial = [...porLote.values()].sort((x, y) => y.fecha_hora.localeCompare(x.fecha_hora));

  // Para «quién recibe»: el responsable y el equipo asignado a la actividad.
  const equipo = s.asignaciones
    .filter((x) => x.actividad_id === id && x.estado === "ACTIVA")
    .map((x) => s.usuarios.find((u) => u.id === x.usuario_id))
    .filter((u) => !!u)
    .map((u) => `${u.nombre} ${u.apellido}`.trim());
  const sugeridos = [...new Set([a.responsable && titleCase(a.responsable), ...equipo].filter(Boolean))];

  const cuando = [a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "Sin fecha", a.hora_inicio && `${a.hora_inicio}${a.hora_fin ? `–${a.hora_fin}` : ""} h`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <Link href={`/actividades/${id}`} className="-ml-1 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[15px] font-semibold text-petroleo hover:underline">
        <IconArrowLeft size={18} /> Ficha de la actividad
      </Link>
      <header className="mb-4">
        <p className="text-[12px] font-extrabold tracking-[0.16em] text-marca uppercase">Logística</p>
        <h1 className="font-titulo text-[23px] leading-tight font-extrabold text-petroleo-600" title={a.nombre}>{nombreCorto(a.nombre)}</h1>
        <p className="mt-0.5 text-[15px] text-gris first-letter:uppercase">{cuando}</p>
        <p className="text-[15px] text-gris">
          {[ubicacionLabel(a), a.lugar, a.direccion].filter(Boolean).join(" · ")}
          {a.responsable && <> · Responsable: <b className="text-tinta">{titleCase(a.responsable)}</b></>}
        </p>
      </header>
      <LogisticaActividad
        actividadId={id}
        resumen={r}
        historial={historial}
        sugeridos={sugeridos}
        ahora={ahoraLocal()}
        puedeGestionar={puede.gestionarLogistica(yo)}
      />
    </div>
  );
}
