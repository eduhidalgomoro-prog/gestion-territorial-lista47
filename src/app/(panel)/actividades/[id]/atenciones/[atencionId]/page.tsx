import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonAccion } from "@/app/(panel)/actividades/[id]/feria/boton-accion";
import { anularAtencionAction } from "@/app/(panel)/actions";
import { IconArrowLeft, IconGato, IconHuella, IconPerro } from "@/components/icons";
import { RegistrarAtencion } from "@/components/registrar-atencion";
import { Notice } from "@/components/ui";
import { textoAnimales } from "@/lib/huellas";
import { formatDni, formatPhone, maskDni } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { puede } from "@/lib/permisos";
import { cargarOperativo } from "../comun";

export const metadata = { title: "Atención" };

export default async function DetalleAtencion({ params, searchParams }: { params: Promise<{ id: string; atencionId: string }>; searchParams: Promise<SP> }) {
  const { id, atencionId } = await params;
  const q = await searchParams;
  const { yo, s, a, registrar, ver } = await cargarOperativo(id);
  if (!ver) return <Notice tone="alerta">Tu rol no tiene acceso a las atenciones de este operativo.</Notice>;
  const at = s.atenciones.find((x) => x.id === atencionId && x.actividad_id === a.id && x.activo);
  if (!at) notFound();
  const p = s.participantes.find((x) => x.id === at.participante_id);
  const animales = s.animales.filter((x) => x.atencion_id === at.id && x.activo).sort((x, y) => (x.especie === y.especie ? x.numero - y.numero : x.especie === "PERRO" ? -1 : 1));
  const volver = `/actividades/${a.id}/atenciones`;

  if (sp(q, "corregir") === "1" && registrar) {
    return (
      <div className="tema-huellas mx-auto max-w-xl">
        <Link href={`${volver}/${at.id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-petroleo"><IconArrowLeft size={16} /> Cancelar corrección</Link>
        <h1 className="mb-4 font-titulo text-2xl font-extrabold text-petroleo-600">Corregir atención</h1>
        <RegistrarAtencion
          actividadId={a.id}
          inicial={{
            id: at.id,
            nombre: p?.nombre ?? "",
            apellido: p?.apellido ?? "",
            dni: p?.dni ?? "",
            animales: animales.map((x) => ({ especie: x.especie, castrado: x.castrado, quiere_castrar: x.castrado ? null : x.quiere_castrar, antirrabica: x.antirrabica, desparasitacion: x.desparasitacion })),
          }}
        />
      </div>
    );
  }

  return (
    <div className="tema-huellas mx-auto max-w-xl">
      <Link href={volver} className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-petroleo"><IconArrowLeft size={16} /> Atenciones</Link>
      <section className="rounded-3xl bg-white p-5 ring-1 ring-linea">
        <p className="flex items-center gap-2 text-xs font-extrabold tracking-[0.14em] text-marca uppercase"><IconHuella size={16} /> Atención · {a.nombre}</p>
        <h1 className="mt-2 font-titulo text-2xl font-extrabold">{p ? `${p.nombre} ${p.apellido}` : "—"}</h1>
        <p className="mt-1 text-[15px] text-gris">
          DNI {p?.dni ? (puede.verDniCompleto(yo) ? formatDni(p.dni) : maskDni(p.dni)) : "—"}
          {p?.telefono && (puede.verTelefono(yo) || registrar) && <> · Tel. {formatPhone(p.telefono)}</>}
        </p>
        <p className="mt-2 font-bold">{textoAnimales(at.perros, at.gatos)}</p>
      </section>

      <ul className="mt-3 space-y-2">
        {animales.map((x) => {
          const Icon = x.especie === "PERRO" ? IconPerro : IconGato;
          return (
            <li key={x.id} className="rounded-2xl bg-white p-4 ring-1 ring-linea">
              <p className="flex items-center gap-2 font-titulo text-lg font-extrabold text-petroleo-600"><Icon size={24} className="text-marca" /> {x.especie === "PERRO" ? "Perro" : "Gato"} {x.numero}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[15px]">
                <dt className="text-gris">Castrado</dt><dd className="font-bold">{x.castrado ? "Sí" : "No"}</dd>
                {!x.castrado && (<><dt className="text-gris">Interés en castrar</dt><dd className="font-bold">{x.quiere_castrar ? "Sí" : "No"}</dd></>)}
                <dt className="text-gris">Antirrábica</dt><dd className="font-bold">{x.antirrabica ? "✓ Sí" : "No"}</dd>
                <dt className="text-gris">Desparasitación</dt><dd className="font-bold">{x.desparasitacion ? "✓ Sí" : "No"}</dd>
              </dl>
            </li>
          );
        })}
      </ul>

      {registrar && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Link href={`${volver}/${at.id}?corregir=1`} className="flex min-h-12 items-center rounded-2xl bg-marca px-5 font-bold text-white">Corregir carga</Link>
          <BotonAccion action={anularAtencionAction.bind(null, at.id, a.id)} variante="fantasma" confirmar="¿Anular esta atención? No se borra: queda registrada como anulada.">
            Anular atención
          </BotonAccion>
        </div>
      )}
    </div>
  );
}
