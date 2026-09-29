import Link from "next/link";
import { notFound } from "next/navigation";
import { Buscador, FiltrosForm } from "@/components/filtros";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, btn, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { formatDate, formatDni, formatPhone, fullName, maskDni, maskPhone, normalizeText, titleCase } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { bajaInscripcionAction } from "../../../actions";

export const metadata = { title: "Inscriptos" };

export default async function Inscriptos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const yo = await requireUser();
  const { id } = await params;
  const q = await searchParams;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  const personas = new Map(s.participantes.map((p) => [p.id, p]));
  const asis = new Map(s.asistencias.filter((x) => x.actividad_id === id).map((x) => [x.participante_id, x.estado]));
  const busq = normalizeText(sp(q, "q"));
  const lista = s.inscripciones
    .filter((i) => i.actividad_id === id && i.estado === "INSCRIPTO")
    .map((i) => ({ i, p: personas.get(i.participante_id) }))
    .filter(({ p }) => !busq || (p && normalizeText(`${p.nombre} ${p.apellido} ${p.dni} ${p.telefono}`).includes(busq)))
    .sort((x, y) => fullName(x.p).localeCompare(fullName(y.p)));
  const dni = puede.verDniCompleto(yo);
  const tel = puede.verTelefono(yo);
  const editar = puede.editarActividad(yo, a);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/actividades/${id}`, label: a.nombre }}
        title="Inscriptos"
        subtitle={`${lista.length} ${lista.length === 1 ? "persona" : "personas"}`}
        actions={
          <>
            {puede.tomarAsistencia(yo, a, s.asignaciones) && <Link href={`/actividades/${id}/asistencia`} className={btn("primario")}>Tomar asistencia</Link>}
            {puede.importar(yo, a) && <Link href={`/actividades/${id}/importar`} className={btn("secundario")}>Importar Google Forms</Link>}
          </>
        }
      />
      <FiltrosForm action={`/actividades/${id}/inscriptos`} className="mb-4">
        <Buscador value={sp(q, "q")} placeholder="Buscar por nombre, apellido, DNI o teléfono" />
      </FiltrosForm>
      {lista.length === 0 ? (
        <Empty>{busq ? "Nadie coincide con la búsqueda." : "Todavía no hay inscriptos."}</Empty>
      ) : (
        <ul className="space-y-2">
          {lista.map(({ i, p }) => {
            const estado = asis.get(i.participante_id);
            return (
              <li key={i.id} className="rounded-2xl border border-linea bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {puede.verParticipantes(yo) ? (
                      <Link href={`/participantes/${i.participante_id}`} className="font-bold hover:text-petroleo hover:underline">{fullName(p)}</Link>
                    ) : (
                      <p className="font-bold">{fullName(p)}</p>
                    )}
                    <p className="text-sm text-gris">
                      DNI {dni ? formatDni(p?.dni ?? "") : maskDni(p?.dni ?? "")}
                      {p?.telefono && ` · Tel. ${tel ? formatPhone(p.telefono) : maskPhone(p.telefono)}`}
                      {p?.barrio && ` · ${titleCase(p.barrio)}`}
                    </p>
                    <p className="text-xs text-gris">
                      Inscripción {formatDate(i.fecha)} · {i.origen.toLowerCase()}
                    </p>
                    {i.respuestas && <p className="mt-1 text-sm whitespace-pre-line">{i.respuestas}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {estado === "PRESENTE" && <Badge color="verde">PRESENTE</Badge>}
                    {estado === "AUSENTE" && <Badge color="gris">AUSENTE</Badge>}
                    {editar && a.estado !== "REALIZADA" && (
                      <details className="relative">
                        <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-sm text-gris hover:bg-fondo">Dar de baja</summary>
                        <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-linea bg-white p-3 shadow-lg">
                          <p className="mb-2 text-sm">¿Quitar a {p?.nombre} de esta actividad?</p>
                          <ActionForm action={bajaInscripcionAction.bind(null, i.id)}>
                            <SubmitButton size="sm" variant="peligro" pendingText="…">Sí, dar de baja</SubmitButton>
                          </ActionForm>
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
