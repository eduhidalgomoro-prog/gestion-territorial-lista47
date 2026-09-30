import Link from "next/link";
import { Buscador, FiltroSelect, FiltrosForm } from "@/components/filtros";
import { Badge, btn, Empty, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { actividadesVisibles, esAdmin, puede } from "@/lib/permisos";
import { formatDni, formatPhone, fullName, maskDni, normalizeText, titleCase } from "@/lib/util";
import { qs, sp, type SP } from "@/lib/view";

export const metadata = { title: "Participantes" };

const POR_PAGINA = 60;

export default async function Participantes({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  if (!puede.verParticipantes(yo)) return <Notice tone="alerta">Tu rol no tiene acceso a la base de participantes.</Notice>;
  const q = await searchParams;
  const s = await snapshot();
  const busq = normalizeText(sp(q, "q"));
  const digitos = sp(q, "q").replace(/\D/g, "");
  const barrio = sp(q, "barrio");
  const soloDup = sp(q, "dup") === "1";
  const n = Math.max(POR_PAGINA, Number(sp(q, "n")) || POR_PAGINA);

  // Responsable: solo personas inscriptas en actividades de su zona.
  const actsVisibles = new Set(actividadesVisibles(yo, s.actividades, s.asignaciones).map((a) => a.id));
  const insc = s.inscripciones.filter((i) => i.estado === "INSCRIPTO" && actsVisibles.has(i.actividad_id));
  const permitidos = esAdmin(yo) ? null : new Set(insc.map((i) => i.participante_id));
  const nInsc = new Map<string, number>();
  for (const i of insc) nInsc.set(i.participante_id, (nInsc.get(i.participante_id) ?? 0) + 1);
  const nAsis = new Map<string, number>();
  for (const a of s.asistencias) if (a.estado === "PRESENTE" && actsVisibles.has(a.actividad_id)) nAsis.set(a.participante_id, (nAsis.get(a.participante_id) ?? 0) + 1);

  const base = s.participantes.filter((p) => !permitidos || permitidos.has(p.id));
  const lista = base
    .filter((p) => !barrio || p.barrio === barrio)
    .filter((p) => !soloDup || p.posible_duplicado_de)
    .filter((p) => {
      if (!busq) return true;
      if (digitos.length >= 4 && (p.dni.includes(digitos) || p.telefono.includes(digitos))) return true;
      const t = normalizeText(`${p.nombre} ${p.apellido} ${p.apellido} ${p.nombre}`);
      return busq.split(" ").every((w) => t.includes(w));
    })
    .sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`));
  const barrios = [...new Set(base.map((p) => p.barrio).filter(Boolean))].sort();
  const dup = base.filter((p) => p.posible_duplicado_de).length;
  const dniCompleto = puede.verDniCompleto(yo);

  return (
    <>
      <PageHeader title="Participantes" subtitle={`${base.length} personas en la base${permitidos ? " (de tu zona)" : ""}`} />
      <FiltrosForm action="/participantes" className="mb-4 space-y-2">
        <Buscador value={sp(q, "q")} placeholder="Buscar por nombre, apellido, DNI o teléfono" />
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <FiltroSelect name="barrio" label="Barrio" value={barrio} placeholder="Todos los barrios" options={barrios.map((b) => [b, titleCase(b)] as const)} />
          {dup > 0 && <FiltroSelect name="dup" label="Duplicados" value={soloDup ? "1" : ""} placeholder="Todas las personas" options={[["1", `Posibles duplicados (${dup})`]]} />}
        </div>
      </FiltrosForm>

      {lista.length === 0 ? (
        <Empty>{base.length ? "Nadie coincide con la búsqueda." : "Todavía no hay participantes. Se agregan al importar inscriptos, con el formulario de inscripción o al tomar asistencia."}</Empty>
      ) : (
        <>
          <p className="mb-2 text-sm text-gris">{lista.length} {lista.length === 1 ? "resultado" : "resultados"}</p>
          <ul className="grid gap-2 md:grid-cols-2">
            {lista.slice(0, n).map((p) => (
              <li key={p.id}>
                <Link href={`/participantes/${p.id}`} className="block rounded-2xl border border-linea bg-white p-4 hover:border-petroleo">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-titulo font-bold">{fullName(p)}</p>
                    {p.posible_duplicado_de && <Badge color="naranja">¿Duplicado?</Badge>}
                  </div>
                  <p className="text-sm text-gris">
                    {p.dni ? `DNI ${dniCompleto ? formatDni(p.dni) : maskDni(p.dni)}` : "Sin DNI"}
                    {p.telefono && ` · ${formatPhone(p.telefono)}`}
                    {p.barrio && ` · ${titleCase(p.barrio)}`}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {nInsc.get(p.id) ?? 0} inscripciones · {nAsis.get(p.id) ?? 0} asistencias
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {lista.length > n && (
            <div className="mt-4 text-center">
              <Link href={`/participantes${qs({ q: sp(q, "q"), barrio, dup: soloDup ? "1" : "", n: n + POR_PAGINA })}`} className={btn("secundario")} scroll={false}>
                Mostrar más ({lista.length - n} restantes)
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
