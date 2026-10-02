import Link from "next/link";
import { ActividadCard } from "@/components/actividad-card";
import { AvanceZonas, BloqueCostos, Destacados, GruposIndicadores, ResumenMes } from "@/components/inicio";
import { InstallBanner } from "@/components/install-button";
import { SelectorPeriodo } from "@/components/periodo";
import { cx, Empty, LinkButton, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { conteosPorActividad, cumplimiento, indicadores } from "@/lib/domain/metricas";
import { destacadosDelMes } from "@/lib/domain/resumen";
import { conteosHuellas } from "@/lib/huellas";
import { zonaLabel } from "@/lib/labels";
import { redirect } from "next/navigation";
import { actividadesVisibles, esAgenda, esDiseno, esFerias, esOperador, puede, zonaForzada } from "@/lib/permisos";
import { nombreMes, today } from "@/lib/util";
import { periodo, type SP } from "@/lib/view";

export const metadata = { title: "Inicio" };

export default async function Inicio({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  // Diseño trabaja desde la pantalla de flyers.
  if (esDiseno(yo)) redirect("/flyers");
  // La responsable de ferias trabaja desde el menú Ferias.
  if (esFerias(yo)) redirect("/ferias");
  const q = await searchParams;
  const { anio, mes: mesQ } = periodo(q);
  const mes = mesQ || Number(today().slice(5, 7));
  const s = await snapshot();
  const visibles = actividadesVisibles(yo, s.actividades, s.asignaciones);
  const conteos = conteosPorActividad(s);
  const huellasPorActividad = conteosHuellas(s.atenciones, s.animales);
  const hoy = today();
  const proximas = visibles
    .filter((a) => a.fecha >= hoy && !["CANCELADA", "REALIZADA", "BORRADOR"].includes(a.estado))
    .sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio));
  const primerNombre = yo.nombre.split(" ")[0];

  // Operador: solo sus actividades asignadas.
  if (esOperador(yo)) {
    return (
      <>
        <InstallBanner />
        <PageHeader kicker="Operador/a de actividad" title={`Hola, ${primerNombre}`} subtitle="Estas son las actividades que tenés asignadas." />
        {visibles.length === 0 ? (
          <Empty>Todavía no tenés actividades asignadas. Pedile al responsable de zona que te asigne.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {[...proximas, ...visibles.filter((a) => !proximas.includes(a))].map((a) => (
              <ActividadCard key={a.id} a={a} conteo={conteos.get(a.id)} huellas={huellasPorActividad.get(a.id)} />
            ))}
          </div>
        )}
      </>
    );
  }

  const zona = zonaForzada(yo);
  const delMes = visibles.filter((a) => a.anio === anio && a.mes === mes && (!zona || a.zona === zona));
  const ind = indicadores(delMes, s, { anio, mes });
  // El responsable ve solo el objetivo de su zona.
  const cumpl = cumplimiento(s.actividades, anio, mes, s.config.objetivo_mensual).filter((c) => !zona || c.zona === zona);
  const costos = puede.verCostos(yo);
  const sinZona = s.actividades.filter((a) => !a.zona && a.estado !== "BORRADOR").length;
  const agenda = esAgenda(yo);

  const proximasSeccion = (
    <section className="mt-6" aria-labelledby="prox">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="prox" className="text-lg font-bold">Próximas actividades</h2>
        <Link href="/calendario" className="text-sm font-bold text-petroleo hover:underline">Ver calendario →</Link>
      </div>
      {proximas.length === 0 ? (
        <Empty action={puede.crearActividad(yo) ? <LinkButton href="/actividades/nueva">+ Nueva actividad</LinkButton> : undefined}>
          No hay actividades programadas próximamente.
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {proximas.slice(0, agenda ? 12 : 6).map((a) => (
            <ActividadCard key={a.id} a={a} conteo={conteos.get(a.id)} huellas={huellasPorActividad.get(a.id)} />
          ))}
        </div>
      )}
    </section>
  );

  const tituloMes = `${nombreMes(mes)} ${anio}`;
  // El interior no tiene objetivo mensual (por ahora): sus responsables no ven el avance por zonas.
  const conObjetivo = !agenda && cumpl.length > 0;
  const destacados = destacadosDelMes(
    ind,
    agenda ? [] : cumpl.map((c) => ({ ...c, nombre: zonaLabel(c.zona) })),
    nombreMes(mes),
  ).filter((d) => !agenda || d.tono === "info" || /primera vez/.test(d.texto));

  return (
    <>
      <InstallBanner />
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-petroleo-50 px-3 py-1 text-xs font-bold tracking-[0.12em] text-petroleo uppercase">
            {zona ? zonaLabel(zona) : "Toda la provincia"}
          </p>
          <h1 className="font-titulo text-3xl font-extrabold tracking-tight sm:text-4xl">Hola, {primerNombre}</h1>
          <p className="mt-0.5 text-[16px] text-gris">Así viene {nombreMes(mes).toLowerCase()} {anio}</p>
        </div>
        <SelectorPeriodo action="/inicio" anio={anio} mes={mes} />
      </header>

      {sinZona > 0 && puede.configurar(yo) && (
        <Notice tone="alerta" className="mb-4">
          Hay {sinZona} {sinZona === 1 ? "actividad" : "actividades"} sin zona asignada (vienen del formulario anterior).{" "}
          <Link href="/actividades?zona=SIN&mes=0" className="font-bold underline">Revisarlas</Link>
        </Notice>
      )}

      {/* Agenda: lo primero son las próximas actividades (es lo que usa para armar la agenda de los referentes). */}
      {agenda && proximasSeccion}

      <div className={cx("space-y-5", agenda && "mt-6")}>
        <ResumenMes titulo={tituloMes} ind={ind} zonas={conObjetivo ? cumpl : []} conActividades={!agenda} />

        <div className={cx("grid gap-5", conObjetivo && "lg:grid-cols-[1fr_1.15fr]")}>
          <Destacados items={destacados} enColumna={conObjetivo} />
          {conObjetivo && <AvanceZonas data={cumpl} anio={anio} mes={mes} />}
        </div>

        <GruposIndicadores ind={ind} conActividades={!agenda} conAlcance={false} />

        {costos && <BloqueCostos estimado={ind.costoEstimado} real={ind.costoReal} />}
      </div>

      {!agenda && proximasSeccion}

      {/* El detalle (por zona, alcance, evolución) está en Estadísticas. */}
      {!agenda && puede.verEstadisticas(yo) && (
        <p className="mt-6 text-center">
          <Link href={`/estadisticas?mes=${mes}&anio=${anio}`} className="text-sm font-bold text-petroleo hover:underline">
            Ver más números en Estadísticas →
          </Link>
        </p>
      )}
    </>
  );
}
