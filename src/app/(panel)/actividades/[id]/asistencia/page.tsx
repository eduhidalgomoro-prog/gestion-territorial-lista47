import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { rubroDe } from "@/components/taller";
import { cx, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { claseActual, claseDeMarca, fechasDeClases } from "@/lib/clases";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { asistenciaPorClase } from "@/lib/services/actividades";
import { claseDe, nombreCorto } from "@/lib/taller-nombre";
import { formatDate, fullName, today } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { TomaAsistencia } from "./toma-asistencia";

export const metadata = { title: "Tomar asistencia" };

export default async function Asistencia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const yo = await requireUser();
  const { id } = await params;
  const q = await searchParams;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  if (!puede.tomarAsistencia(yo, a, s.asignaciones)) {
    return <Notice tone="alerta">No tenés asignada la toma de asistencia de esta actividad.</Notice>;
  }
  if (a.estado === "CANCELADA") return <Notice tone="alerta">La actividad está cancelada.</Notice>;
  // Talleres de varias clases: cada clase tiene su propia asistencia. Por defecto, la de hoy.
  const fechas = fechasDeClases(a);
  const total = fechas.length;
  const pedida = Number(sp(q, "clase"));
  const clase = Number.isInteger(pedida) && pedida >= 1 && pedida <= total ? pedida : claseActual(fechas, today());
  const porClase = total > 1 ? asistenciaPorClase(a, s) : [];
  const personas = new Map(s.participantes.map((p) => [p.id, p]));
  const asis = new Map(s.asistencias.filter((x) => x.actividad_id === id && claseDeMarca(x) === clase).map((x) => [x.participante_id, x.estado]));
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
  // Con fechas de clases cargadas, manda eso; si no, lo que diga el nombre (sin inventar).
  const delNombre = total === 1 ? claseDe(a.nombre, a.fecha) : null;
  const fechaClase = fechas[clase - 1] || a.fecha;
  const cuando = fechaClase ? formatDate(fechaClase, { weekday: "long", day: "numeric", month: "long" }) : "";
  const horario = a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? ` – ${a.hora_fin}` : ""}` : "";
  const etiquetaClase = total > 1 ? `Clase ${clase} de ${total}` : delNombre ? `Clase ${delNombre.n} de ${delNombre.total}` : "";
  const detalle = [etiquetaClase, cuando && cuando.charAt(0).toUpperCase() + cuando.slice(1).replace(",", ""), horario].filter((x): x is string => !!x);

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
      {total > 1 && (
        <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Clases del taller">
          {porClase.map((c) => {
            const activa = c.clase === clase;
            const tomada = c.presentes + c.ausentes > 0;
            return (
              <Link
                key={c.clase}
                href={`/actividades/${id}/asistencia?clase=${c.clase}`}
                scroll={false}
                aria-current={activa ? "page" : undefined}
                className={cx(
                  "flex min-w-[88px] shrink-0 flex-col items-center rounded-2xl px-3 py-2 text-center transition-colors",
                  activa ? "bg-petroleo text-white shadow-[0_2px_6px_rgba(16,105,133,0.25)]" : "bg-white ring-1 ring-linea hover:ring-petroleo/50",
                )}
              >
                <span className="text-[14px] font-extrabold">Clase {c.clase}</span>
                <span className={cx("text-[12.5px] font-semibold", activa ? "text-white/85" : "text-gris")}>
                  {c.fecha ? formatDate(c.fecha, { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "") : "Sin fecha"}
                </span>
                <span className={cx("mt-0.5 text-[12.5px] font-bold", activa ? "text-white" : tomada ? "text-marca-600" : "text-gris")}>
                  {tomada ? `✓ ${c.presentes} ${c.presentes === 1 ? "presente" : "presentes"}` : "Sin tomar"}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
      {a.estado === "REALIZADA" && (
        <Notice className="mb-4">
          La actividad ya está cerrada. Podés corregir la asistencia; los totales de la ficha se actualizan al{" "}
          <Link href={`/actividades/${id}/cerrar`} className="font-bold underline">editar el cierre</Link>.
        </Notice>
      )}
      <TomaAsistencia
        key={clase}
        actividadId={id}
        titulo={total > 1 ? `${titulo} · Clase ${clase}` : titulo}
        clase={clase}
        inicial={lista}
        barrios={barrios}
        // Cerrar la actividad: al terminar la última clase.
        puedeCerrar={puede.cerrarActividad(yo, a) && a.estado !== "REALIZADA" && clase === total}
      />
    </div>
  );
}
