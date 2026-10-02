import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { rubroDe } from "@/components/taller";
import { Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { claseDe, nombreCorto } from "@/lib/taller-nombre";
import { formatDate, fullName } from "@/lib/util";
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
  // Para tomar asistencia alcanza con nombre y los últimos números del DNI (nada de barrio, teléfono ni dirección).
  const lista = s.inscripciones
    .filter((i) => i.actividad_id === id && i.estado === "INSCRIPTO")
    .map((i) => {
      const p = personas.get(i.participante_id);
      const dni = p?.dni ?? "";
      return {
        id: i.participante_id,
        nombre: fullName(p),
        dniVisible: dni ? `••••${dni.slice(-3)}` : "",
        // Para buscar: la administración puede escribir el DNI completo; el resto, los últimos 4 números.
        dni: puede.verDniCompleto(yo) ? dni : dni.slice(-4),
        estado: asis.get(i.participante_id) || null,
      };
    })
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  const barrios = s.barrios.filter((b) => b.activo).map((b) => b.barrio).sort();

  const { Icon } = rubroDe(a);
  const titulo = nombreCorto(a.nombre);
  const clase = claseDe(a.nombre, a.fecha);
  const cuando = a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "";
  const horario = a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? ` – ${a.hora_fin}` : ""}` : "";
  const detalle = [clase && `Clase ${clase.n} de ${clase.total}`, cuando && cuando.charAt(0).toUpperCase() + cuando.slice(1).replace(",", ""), horario].filter((x): x is string => !!x);

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <Link href={`/actividades/${id}`} className="-ml-1 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[15px] font-semibold text-petroleo hover:underline">
        <IconArrowLeft size={18} /> Ficha de la actividad
      </Link>
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-verde-50 text-marca" aria-hidden>
          <Icon size={24} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold tracking-[0.16em] text-marca uppercase">Tomar asistencia</p>
          <h1 className="font-titulo text-[23px] leading-tight font-extrabold text-petroleo-600 line-clamp-2" title={a.nombre}>{titulo}</h1>
          {detalle.length > 0 && (
            <p className="mt-0.5 text-[15px] text-gris">
              {/* Cada dato entero en su renglón: el horario no se corta a la mitad. */}
              {detalle.map((d, i) => (
                <span key={d}>{i > 0 && " · "}<span className="whitespace-nowrap">{d}</span></span>
              ))}
            </p>
          )}
        </div>
      </header>
      {a.estado === "REALIZADA" && (
        <Notice className="mb-4">
          La actividad ya está cerrada. Podés corregir la asistencia; los totales de la ficha se actualizan al{" "}
          <Link href={`/actividades/${id}/cerrar`} className="font-bold underline">editar el cierre</Link>.
        </Notice>
      )}
      <TomaAsistencia
        actividadId={id}
        titulo={titulo}
        inicial={lista}
        barrios={barrios}
        puedeCerrar={puede.cerrarActividad(yo, a) && a.estado !== "REALIZADA"}
      />
    </div>
  );
}
