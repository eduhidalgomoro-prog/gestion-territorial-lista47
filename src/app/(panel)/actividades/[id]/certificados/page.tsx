import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/components/boton-imprimir";
import { IconDownload } from "@/components/icons";
import { cx, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { planillaCertificados } from "@/lib/certificados";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { formatDate, formatDni, maskDni } from "@/lib/util";
import { sp, type SP } from "@/lib/view";

export const metadata = { title: "Asistencia por persona" };

/** Taller de varias clases: a qué clases vino cada persona y quiénes cumplen el mínimo para el certificado. */
export default async function Certificados({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const yo = await requireUser();
  const { id } = await params;
  const q = await searchParams;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verInscriptos(yo, a, s.asignaciones)) notFound();
  const { fechas, minimo, filas, cumplen, clasesSinCargar } = planillaCertificados(a, s, Number(sp(q, "min")) || undefined);
  const verDni = puede.verDniCompleto(yo);
  const corta = (f: string) => (f ? formatDate(f, { day: "numeric", month: "numeric" }) : "");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: `/actividades/${id}`, label: a.nombre }}
        title="Asistencia por persona"
        subtitle={`${fechas.length} clases · ${filas.length} personas · ${cumplen} con certificado`}
        actions={
          <>
            <a href={`/actividades/${id}/certificados/excel?min=${minimo}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-marca px-3 text-sm font-bold text-white hover:bg-marca-600 print:hidden">
              <IconDownload size={17} /> Descargar Excel
            </a>
            <BotonImprimir />
          </>
        }
      />

      {clasesSinCargar.length > 0 && (
        <Notice tone="alerta" className="mb-4 print:hidden">
          Falta cargar la asistencia de {clasesSinCargar.map((c) => `la clase ${c.clase}${c.fecha ? ` (${corta(c.fecha)})` : ""}`).join(" y ")}. Hasta que se cargue, nadie suma esa clase.{" "}
          <Link href={`/actividades/${id}/asistencia?clase=${clasesSinCargar[0].clase}`} className="font-bold underline">Cargar la clase {clasesSinCargar[0].clase}</Link>
        </Notice>
      )}

      <section className="mb-4 rounded-2xl border border-linea bg-white p-4 print:hidden">
        <p className="mb-2 text-sm font-bold">Mínimo de clases para el certificado</p>
        <div className="flex flex-wrap gap-2">
          {fechas.map((_, i) => (
            <Link
              key={i}
              href={`/actividades/${id}/certificados?min=${i + 1}`}
              aria-current={minimo === i + 1 ? "true" : undefined}
              className={cx("inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold ring-1", minimo === i + 1 ? "bg-petroleo text-white ring-petroleo" : "bg-white text-petroleo ring-linea hover:ring-petroleo")}
            >
              {i + 1} de {fechas.length}
            </Link>
          ))}
        </div>
        <p className="mt-2 text-sm text-gris">
          Con {minimo} de {fechas.length} clases, <b className="text-tinta">{cumplen} {cumplen === 1 ? "persona recibe" : "personas reciben"} certificado</b>.
        </p>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-linea bg-white">
        <table className="w-full text-left text-[14.5px]">
          <thead className="bg-fondo text-xs font-bold text-gris uppercase">
            <tr>
              <th className="px-3 py-2">Persona</th>
              <th className="px-3 py-2">DNI</th>
              {fechas.map((f, i) => (
                <th key={i} className="px-2 py-2 text-center whitespace-nowrap">
                  Clase {i + 1}
                  {f && <span className="block font-semibold normal-case">{corta(f)}</span>}
                </th>
              ))}
              <th className="px-3 py-2 text-center">Total</th>
              <th className="px-3 py-2">Certificado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, n) => (
              <tr key={`${f.dni}-${n}`} className={cx("border-t border-linea", f.cumple && "bg-verde-50/50")}>
                <td className="px-3 py-2 font-semibold">{`${f.apellido}, ${f.nombre}`.replace(/^, /, "")}</td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{f.dni ? (verDni ? formatDni(f.dni) : maskDni(f.dni)) : "—"}</td>
                {f.porClase.map((e, i) => (
                  <td key={i} className="px-2 py-2 text-center">
                    {e === "PRESENTE" ? <span className="font-bold text-ok" aria-label="Vino">✓</span> : e === "AUSENTE" ? <span className="text-peligro" aria-label="No vino">✗</span> : <span className="text-gris/60" aria-label="Sin marcar">·</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-bold tabular-nums whitespace-nowrap">{f.presentes} de {fechas.length}</td>
                <td className="px-3 py-2">{f.cumple ? <span className="font-bold text-marca-600">Sí</span> : <span className="text-gris">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gris">✓ vino · ✗ no vino · · sin marcar. Ordenado por cantidad de clases.</p>
    </div>
  );
}
