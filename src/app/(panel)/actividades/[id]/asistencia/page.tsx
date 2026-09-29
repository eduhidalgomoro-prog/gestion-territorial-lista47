import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { fullName, maskDni, titleCase } from "@/lib/util";
import { TomaAsistencia } from "./toma-asistencia";

export const metadata = { title: "Tomar asistencia" };

export default async function Asistencia({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requireUser();
  const { id } = await params;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  if (!puede.tomarAsistencia(yo, a, s.asignaciones)) {
    return <Notice tone="alerta">No tenés asignada la toma de asistencia de esta actividad.</Notice>;
  }
  if (a.estado === "CANCELADA") return <Notice tone="alerta">La actividad está cancelada.</Notice>;
  const personas = new Map(s.participantes.map((p) => [p.id, p]));
  const asis = new Map(s.asistencias.filter((x) => x.actividad_id === id).map((x) => [x.participante_id, x.estado]));
  const lista = s.inscripciones
    .filter((i) => i.actividad_id === id && i.estado === "INSCRIPTO")
    .map((i) => {
      const p = personas.get(i.participante_id);
      return {
        id: i.participante_id,
        nombre: fullName(p),
        detalle: [
          i.confirmacion === "CONFIRMÓ" ? "✓ Confirmó" : i.confirmacion === "NO VA" ? "✗ Avisó que no va" : "",
          p?.dni ? `DNI ${maskDni(p.dni)}` : "",
          p?.barrio ? titleCase(p.barrio) : "",
        ].filter(Boolean).join(" · "),
        // Solo la administración recibe el DNI completo; el resto, los últimos 4 dígitos (alcanza para buscar).
        dni: puede.verDniCompleto(yo) ? p?.dni ?? "" : (p?.dni ?? "").slice(-4),
        estado: asis.get(i.participante_id) ?? null,
      };
    })
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  const barrios = s.barrios.filter((b) => b.activo).map((b) => b.barrio).sort();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: `/actividades/${id}`, label: "Ficha de la actividad" }} kicker="Tomar asistencia" title={a.nombre} />
      {a.estado === "REALIZADA" && (
        <Notice className="mb-4">
          La actividad ya está cerrada. Podés corregir la asistencia; los totales de la ficha se actualizan al{" "}
          <Link href={`/actividades/${id}/cerrar`} className="font-bold underline">editar el cierre</Link>.
        </Notice>
      )}
      <TomaAsistencia actividadId={id} inicial={lista} barrios={barrios} puedeCerrar={puede.cerrarActividad(yo, a) && a.estado !== "REALIZADA"} />
    </div>
  );
}
