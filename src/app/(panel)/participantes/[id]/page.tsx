import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { cantidadClases, estadoPorPersona } from "@/lib/clases";
import { zonaLabel } from "@/lib/labels";
import { actividadesVisibles, esAdmin, puede } from "@/lib/permisos";
import { edad, formatDate, formatDni, formatPhone, fullName, maskDni, nombreMes, titleCase } from "@/lib/util";

export const metadata = { title: "Participante" };

export default async function FichaParticipante({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requireUser();
  if (!puede.verParticipantes(yo)) return <Notice tone="alerta">Tu rol no tiene acceso a la base de participantes.</Notice>;
  const { id } = await params;
  const s = await snapshot();
  const p = s.participantes.find((x) => x.id === id);
  if (!p) notFound();
  const visibles = new Map(actividadesVisibles(yo, s.actividades, s.asignaciones).map((a) => [a.id, a]));
  const inscripciones = s.inscripciones.filter((i) => i.participante_id === id && i.estado === "INSCRIPTO");
  // Un responsable solo puede ver personas que participaron en su zona.
  if (!esAdmin(yo) && !inscripciones.some((i) => visibles.has(i.actividad_id))) notFound();
  const suyas = s.asistencias.filter((a) => a.participante_id === id);
  // Por actividad: presente si vino a alguna clase (talleres de varias clases).
  const asis = estadoPorPersona(suyas.map((a) => ({ ...a, participante_id: a.actividad_id })));
  const clasesPresente = (actividadId: string) => suyas.filter((x) => x.actividad_id === actividadId && x.estado === "PRESENTE").length;
  const historial = inscripciones
    .map((i) => ({ i, a: visibles.get(i.actividad_id) }))
    .filter((x) => x.a)
    .sort((x, y) => (y.a!.fecha || "").localeCompare(x.a!.fecha || ""));
  const presentes = historial.filter((h) => asis.get(h.a!.id) === "PRESENTE").length;
  const dup = p.posible_duplicado_de ? s.participantes.find((x) => x.id === p.posible_duplicado_de) : undefined;
  // Respuesta más reciente a las preguntas de la Escuela.
  const escuela = inscripciones.filter((i) => i.participo_antes || i.ex_alumna || i.quiere_ser_profe || i.conoce_espacio).sort((x, y) => y.creado.localeCompare(x.creado))[0];
  const primera = p.fecha_primera ? `${nombreMes(Number(p.fecha_primera.slice(5, 7)))} ${p.fecha_primera.slice(0, 4)}` : "—";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/participantes", label: "Participantes" }} title={fullName(p).toUpperCase()} subtitle={<span className="font-mono text-xs">{p.id}</span>} />

      {dup && (
        <Notice tone="alerta" className="mb-4">
          Posible duplicado: tiene el mismo teléfono que{" "}
          <Link href={`/participantes/${dup.id}`} className="font-bold underline">{fullName(dup)}</Link> (DNI distinto). Revisá si es la misma persona.
        </Notice>
      )}

      <Card className="p-4 sm:p-5">
        <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
          <Fila k="Nombre" v={p.nombre} />
          <Fila k="Apellido" v={p.apellido} />
          <Fila k="DNI" v={!p.dni ? "Sin DNI (se completa cuando se inscriba con DNI)" : puede.verDniCompleto(yo) ? formatDni(p.dni) : maskDni(p.dni)} />
          <Fila k="Teléfono" v={p.telefono ? formatPhone(p.telefono) : "—"} />
          <Fila k="Ciudad" v={p.ciudad || "—"} />
          <Fila k="Barrio" v={titleCase(p.barrio) || "—"} />
          <Fila k="Dirección" v={p.direccion || "—"} />
          <Fila k="Edad" v={edad(p.fecha_nacimiento) !== null ? `${edad(p.fecha_nacimiento)} años (${formatDate(p.fecha_nacimiento)})` : "—"} />
          <Fila k="Primera participación" v={primera} />
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-petroleo-50 py-3 text-petroleo-600">
            <p className="font-titulo text-3xl leading-none font-extrabold">{historial.length}</p>
            <p className="mt-1 text-xs font-bold uppercase">Actividades inscriptas</p>
          </div>
          <div className="rounded-2xl bg-verde-50 py-3 text-marca-600">
            <p className="font-titulo text-3xl leading-none font-extrabold">{presentes}</p>
            <p className="mt-1 text-xs font-bold uppercase">Asistencias</p>
          </div>
        </div>
      </Card>

      {escuela && (
        <section className="mt-4 rounded-2xl border border-linea bg-white p-4 sm:p-5">
          <h2 className="mb-1 text-lg font-bold">Escuela</h2>
          <p className="mb-3 text-sm text-gris">Lo que respondió en el formulario de inscripción ({formatDate(escuela.fecha)}).</p>
          <dl className="grid gap-y-2 text-[15px]">
            {escuela.participo_antes && <Fila k="Ya participó antes" v={escuela.participo_antes === "SI" ? "Sí" : "No"} />}
            {escuela.ex_alumna && <Fila k="Ex alumna ESME" v={escuela.ex_alumna === "SI" ? "Sí" : "No"} />}
            {escuela.quiere_ser_profe && <Fila k="Quiere ser profe" v={escuela.quiere_ser_profe === "SI" ? `Sí${escuela.ensenaria ? ` · ${escuela.ensenaria}` : ""}` : "No"} />}
            {escuela.conoce_espacio && <Fila k="Conoce un espacio" v={escuela.conoce_espacio === "SI" ? `Sí${escuela.espacio ? ` · ${escuela.espacio}` : ""}` : "No"} />}
          </dl>
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-linea bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-lg font-bold">Historial</h2>
        {historial.length === 0 ? (
          <p className="text-gris">Sin actividades{esAdmin(yo) ? "" : " en tu zona"}.</p>
        ) : (
          <ul className="divide-y divide-linea">
            {historial.map(({ i, a }) => {
              const e = asis.get(a!.id);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link href={`/actividades/${a!.id}`} className="font-bold hover:text-petroleo hover:underline">{a!.nombre}</Link>
                    <p className="text-sm text-gris">
                      {a!.fecha ? formatDate(a!.fecha) : "Sin fecha"} · {zonaLabel(a!.zona)} · inscripción {i.origen.toLowerCase()}
                      {cantidadClases(a!) > 1 && ` · vino a ${clasesPresente(a!.id)} de ${cantidadClases(a!)} clases`}
                    </p>
                  </div>
                  {e === "PRESENTE" ? <Badge color="verde">PRESENTE</Badge> : e === "AUSENTE" ? <Badge color="gris">AUSENTE</Badge> : <Badge color="azul">{a!.estado === "REALIZADA" ? "SIN REGISTRO" : "INSCRIPTA"}</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-40 shrink-0 text-gris">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
