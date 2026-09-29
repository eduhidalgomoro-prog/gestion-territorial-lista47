import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { resumenAsistencia } from "@/lib/services/actividades";
import { formatMoney } from "@/lib/util";
import { cerrarAction } from "../../../actions";

export const metadata = { title: "Cerrar actividad" };

export default async function Cerrar({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requireUser();
  const { id } = await params;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  if (!puede.cerrarActividad(yo, a)) return <Notice tone="alerta">Solo la administración o el responsable de la zona pueden cerrar la actividad.</Notice>;
  if (a.estado === "CANCELADA") return <Notice tone="alerta">La actividad está cancelada: no se puede cerrar.</Notice>;
  const r = resumenAsistencia(id, s);
  const yaCerrada = a.estado === "REALIZADA";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: `/actividades/${id}`, label: a.nombre }} kicker={yaCerrada ? "Editar cierre" : "Cierre de actividad"} title={a.nombre} />

      <Card className="mb-4 p-4 sm:p-5">
        <p className="mb-3 text-sm font-bold tracking-wide text-gris uppercase">Resultado de la asistencia</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Dato n={r.inscriptos} label="Inscriptos" />
          <Dato n={r.presentes} label="Presentes" />
          <Dato n={r.ausentes} label="Ausentes" />
          <Dato n={`${r.pct}%`} label="Asistencia" />
        </div>
        {r.sinMarcar > 0 && (
          <Notice tone="alerta" className="mt-3">
            {r.sinMarcar} {r.sinMarcar === 1 ? "persona inscripta no fue marcada y va a quedar" : "personas inscriptas no fueron marcadas y van a quedar"} como AUSENTE.{" "}
            <Link href={`/actividades/${id}/asistencia`} className="font-bold underline">Revisar la asistencia</Link>
          </Notice>
        )}
        <p className="mt-3 text-sm text-gris">La cantidad de asistentes se calcula sola con la asistencia cargada.</p>
      </Card>

      <ActionForm action={cerrarAction.bind(null, id)}>
        <Field label="Costo real" name="costo_real" hint={a.costo_estimado ? `Estimado: ${formatMoney(a.costo_estimado)}` : undefined}>
          <Input name="costo_real" type="number" inputMode="numeric" min={0} defaultValue={a.costo_real || ""} placeholder="$" />
        </Field>
        <Field label="Resultados" name="resultados" optional>
          <Textarea name="resultados" defaultValue={a.resultados} placeholder="¿Cómo salió? ¿Qué se logró?" />
        </Field>
        <Field label="Incidencias" name="incidencias" optional>
          <Textarea name="incidencias" defaultValue={a.incidencias} placeholder="Problemas, imprevistos, cosas a mejorar" />
        </Field>
        <Field label="Observaciones" name="observaciones" optional>
          <Textarea name="observaciones" defaultValue={a.observaciones} />
        </Field>
        <Field label="Fotografías" name="fotos" optional hint="Subí las fotos a una carpeta de Google Drive o Google Fotos y pegá acá el link (uno por línea).">
          <Textarea name="fotos" defaultValue={a.fotos} placeholder="https://drive.google.com/…" rows={2} />
        </Field>
        <SubmitButton pendingText="Cerrando…" className="w-full sm:w-auto">{yaCerrada ? "Guardar cierre" : "Cerrar actividad (queda REALIZADA)"}</SubmitButton>
      </ActionForm>
    </div>
  );
}

function Dato({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-xl bg-fondo py-3 text-center">
      <p className="font-titulo text-2xl leading-none font-extrabold tabular-nums">{n}</p>
      <p className="mt-1 text-xs font-bold text-gris uppercase">{label}</p>
    </div>
  );
}
