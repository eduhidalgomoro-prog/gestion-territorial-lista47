import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/forms";
import { Badge, Card, cx, Empty, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { SectoresEditor } from "@/components/sectores-editor";
import { CAPACIDAD, SECTORES_INICIALES } from "@/lib/ferias";
import { opcionesZona, ubicacionLabel } from "@/lib/labels";
import { actividadesVisibles, esResponsable, puede } from "@/lib/permisos";
import type { Actividad } from "@/lib/schema";
import { ferianteActivas, puestosDe } from "@/lib/services/ferias";
import { parseRegiones, SIN_REGION } from "@/lib/territorio";
import { formatDate, today } from "@/lib/util";
import { crearFeriaAction } from "../actions";

export const metadata = { title: "Ferias" };

/** Menú Ferias: todas las ferias (próximas y pasadas) y el alta rápida de una nueva. */
export default async function Ferias() {
  const yo = await requireUser();
  if (!puede.verFerias(yo)) return <Notice tone="alerta">Tu rol no tiene acceso a las ferias.</Notice>;
  const s = await snapshot();
  const visibles = actividadesVisibles(yo, s.actividades, s.asignaciones);
  const hoy = today();
  const ferias = visibles.filter((a) => a.es_feria).sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));
  const proximas = ferias.filter((a) => !a.fecha || a.fecha >= hoy);
  const pasadas = ferias.filter((a) => a.fecha && a.fecha < hoy).reverse();
  // Actividades tipo feria que todavía no se organizaron con cupo y puestos.
  const sinOrganizar = visibles.filter((a) => !a.es_feria && /feria/i.test(`${a.tipo} ${a.nombre}`) && (!a.fecha || a.fecha >= hoy) && a.estado !== "CANCELADA" && puede.editarActividad(yo, a));
  const zonas = esResponsable(yo) ? [] : opcionesZona([...parseRegiones(s.config.regiones_interior).map((r) => r.nombre), SIN_REGION]);

  const tarjeta = (a: Actividad) => {
    const inscriptas = ferianteActivas(s, a.id);
    const puestos = puestosDe(s, a.id);
    const conPuesto = inscriptas.filter((f) => f.puesto).length;
    const lugares = puestos.reduce((n, p) => n + CAPACIDAD[p.tipo], 0);
    const pct = a.cupo ? Math.min(100, Math.round((inscriptas.length / a.cupo) * 100)) : 0;
    return (
      <li key={a.id}>
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/actividades/${a.id}/feria`} className="font-titulo text-lg font-extrabold hover:text-petroleo hover:underline">{a.nombre}</Link>
              <p className="text-sm text-gris first-letter:uppercase">
                {[a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "Sin fecha", a.hora_inicio && `${a.hora_inicio} h`, a.lugar, ubicacionLabel(a)].filter(Boolean).join(" · ")}
              </p>
            </div>
            {a.cupo > 0 && inscriptas.length >= a.cupo ? <Badge color="naranja">CUPO COMPLETO</Badge> : a.inscripcion_abierta ? <Badge color="verde">INSCRIPCIÓN ABIERTA</Badge> : <Badge color="gris">INSCRIPCIÓN CERRADA</Badge>}
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-sm font-semibold">
              <span>{inscriptas.length} de {a.cupo} inscriptas</span>
              <span className="text-gris">{puestos.length ? `${conPuesto} con puesto · ${puestos.length} puestos (${lugares} lugares)` : "Sin puestos armados"}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-fondo">
              <div className={cx("h-full rounded-full", pct >= 100 ? "bg-alerta" : "bg-marca")} style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/actividades/${a.id}/feria`} className="inline-flex min-h-10 items-center rounded-xl bg-petroleo px-4 text-sm font-bold text-white">Feriantes y puestos</Link>
            <Link href={`/actividades/${a.id}/feria?tab=listado`} className="inline-flex min-h-10 items-center rounded-xl border border-linea px-3 text-sm font-bold text-petroleo">Listado</Link>
            {a.link_inscripcion && a.inscripcion_abierta && <CopyButton text={a.link_inscripcion} label="Copiar link de inscripción" />}
          </div>
        </Card>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Ferias" subtitle="Inscripción con cupo, puestos numerados, croquis y listado para las feriantes." />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <h2 className="mb-2 text-lg font-bold">Próximas</h2>
          {proximas.length ? <ul className="space-y-3">{proximas.map(tarjeta)}</ul> : <Empty>No hay ferias próximas. Creá una con el formulario.</Empty>}

          {sinOrganizar.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-1 text-lg font-bold">Ferias cargadas como actividad</h2>
              <p className="mb-2 text-sm text-gris">Todavía no tienen cupo ni puestos. Tocá para organizarlas.</p>
              <ul className="space-y-2">
                {sinOrganizar.map((a) => (
                  <li key={a.id}>
                    <Link href={`/actividades/${a.id}/feria`} className="block rounded-2xl border border-dashed border-linea bg-white p-3 hover:border-petroleo">
                      <span className="font-bold">{a.nombre}</span>
                      <span className="block text-sm text-gris">{a.fecha ? formatDate(a.fecha) : "Sin fecha"} · {ubicacionLabel(a)} · <b className="text-petroleo">Organizar como feria →</b></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pasadas.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-lg font-bold">Ferias anteriores ({pasadas.length})</summary>
              <ul className="mt-2 space-y-3">{pasadas.map(tarjeta)}</ul>
            </details>
          )}
        </div>

        {puede.crearActividad(yo) && (
          <Card className="h-fit p-4 sm:p-5">
            <h2 className="mb-1 text-lg font-bold">Nueva feria</h2>
            <p className="mb-3 text-sm text-gris">Se crea la actividad con su formulario de inscripción (con cupo) y los puestos numerados. Los demás datos se completan después en la ficha.</p>
            <ActionForm action={crearFeriaAction}>
              <Field label="Nombre" name="nombre"><Input name="nombre" defaultValue="Feria de Mujeres Emprendedoras" /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Fecha" name="fecha"><Input name="fecha" type="date" /></Field>
                <Field label="Desde" name="hora_inicio" optional><Input name="hora_inicio" type="time" /></Field>
                <Field label="Hasta" name="hora_fin" optional><Input name="hora_fin" type="time" /></Field>
              </div>
              <Field label="Lugar" name="lugar"><Input name="lugar" defaultValue="Parque Camba Cuá" /></Field>
              {zonas.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Zona o región" name="zona"><Select name="zona" defaultValue="NORTE" options={zonas} /></Field>
                  <Field label="Barrio / localidad" name="barrio" optional hint="Localidad si es en el interior."><Input name="barrio" defaultValue="CAMBA CUA" /></Field>
                </div>
              ) : (
                <Field label="Barrio" name="barrio" optional><Input name="barrio" /></Field>
              )}
              <input type="hidden" name="localidad" value="" />
              <Field label="Cupo de feriantes" name="cupo"><Input name="cupo" type="number" min={1} inputMode="numeric" defaultValue="60" /></Field>
              <p className="mb-1 text-[15px] font-bold">Sectores y gazebos</p>
              <p className="mb-2 text-sm text-gris">Cada sector es una fila del croquis. Se puede cambiar después.</p>
              <SectoresEditor inicial={SECTORES_INICIALES} />
              <SubmitButton>Crear feria</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
