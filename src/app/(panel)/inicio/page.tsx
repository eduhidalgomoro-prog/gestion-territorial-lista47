import Link from "next/link";
import { ActividadCard } from "@/components/actividad-card";
import { BarrasDobles, ChartCard, Columnas } from "@/components/charts";
import { CumplimientoZonas } from "@/components/cumplimiento";
import { InstallBanner } from "@/components/install-button";
import { SelectorPeriodo } from "@/components/periodo";
import { cx, Empty, LinkButton, Notice, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { conteosPorActividad, cumplimiento, evolucion, indicadores, inscriptosVsAsistentes } from "@/lib/domain/metricas";
import { zonaLabel } from "@/lib/labels";
import { redirect } from "next/navigation";
import { actividadesVisibles, esAgenda, esDiseno, esOperador, puede, zonaForzada } from "@/lib/permisos";
import { formatMoney, formatNumber, nombreMes, today } from "@/lib/util";
import { periodo, type SP } from "@/lib/view";

export const metadata = { title: "Inicio" };

export default async function Inicio({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  // Diseño trabaja desde la pantalla de flyers.
  if (esDiseno(yo)) redirect("/flyers");
  const q = await searchParams;
  const { anio, mes: mesQ } = periodo(q);
  const mes = mesQ || Number(today().slice(5, 7));
  const s = await snapshot();
  const visibles = actividadesVisibles(yo, s.actividades, s.asignaciones);
  const conteos = conteosPorActividad(s);
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
              <ActividadCard key={a.id} a={a} conteo={conteos.get(a.id)} />
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
  const evo = evolucion({ ...s, actividades: visibles }, { anio, mes }, 6, zona || undefined);
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
            <ActividadCard key={a.id} a={a} conteo={conteos.get(a.id)} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <>
      <InstallBanner />
      <PageHeader
        kicker={zona ? zonaLabel(zona) : "Toda la provincia"}
        title={`Hola, ${primerNombre}`}
        subtitle={`Resumen de ${nombreMes(mes).toLowerCase()} ${anio}`}
        actions={<SelectorPeriodo action="/inicio" anio={anio} mes={mes} />}
      />

      {sinZona > 0 && puede.configurar(yo) && (
        <Notice tone="alerta" className="mb-4">
          Hay {sinZona} {sinZona === 1 ? "actividad" : "actividades"} sin zona asignada (vienen del formulario anterior).{" "}
          <Link href="/actividades?zona=SIN&mes=0" className="font-bold underline">Revisarlas</Link>
        </Notice>
      )}

      {/* Agenda: lo primero son las próximas actividades (es lo que usa para armar la agenda de los referentes). */}
      {agenda && proximasSeccion}

      <div className={cx("grid gap-4", !agenda && cumpl.length > 0 && "lg:grid-cols-[1fr_1.4fr]", agenda && "mt-6")}>
        {/* El interior no tiene objetivo mensual (por ahora): sus responsables no ven este cuadro. */}
        {!agenda && cumpl.length > 0 && <CumplimientoZonas data={cumpl} anio={anio} mes={mes} />}
        <section aria-label="Indicadores del mes" className={cx("grid grid-cols-2 gap-3", agenda ? "sm:grid-cols-5" : "sm:grid-cols-3")}>
          {!agenda && (
            <>
              <Stat label="Programadas" value={ind.programadas} hint={ind.borradores ? `${ind.borradores} en borrador` : undefined} />
              <Stat label="Realizadas" value={ind.realizadas} tone="verde" />
              <Stat label="Suspendidas / canceladas" value={ind.suspendidas + ind.canceladas} tone={ind.suspendidas + ind.canceladas ? "alerta" : "gris"} />
            </>
          )}
          <Stat label="Inscriptos" value={formatNumber(ind.inscriptos)} />
          <Stat label="Asistentes" value={formatNumber(ind.asistentes)} tone="verde" />
          <Stat label="% asistencia" value={`${ind.pctAsistencia}%`} hint="en actividades realizadas" />
          <Stat label="Personas nuevas" value={formatNumber(ind.personasNuevas)} />
          <Stat label="Personas recurrentes" value={formatNumber(ind.personasRecurrentes)} />
          {costos && <Stat label="Costo estimado" value={formatMoney(ind.costoEstimado)} />}
          {costos && <Stat label="Costo real" value={formatMoney(ind.costoReal)} />}
        </section>
      </div>

      {!agenda && proximasSeccion}

      {/* Agenda no necesita gráficos: su inicio es la lista de próximas actividades. */}
      {!agenda && <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Inscriptos vs. asistentes por zona">
          <BarrasDobles data={inscriptosVsAsistentes(delMes, s)} leyenda={["Inscriptos", "Asistentes"]} />
        </ChartCard>
        <ChartCard
          title="Evolución (últimos 6 meses)"
          action={puede.verEstadisticas(yo) ? <Link href="/estadisticas" className="text-sm font-bold text-petroleo hover:underline">Más →</Link> : undefined}
        >
          <Columnas
            data={evo.map((e) => ({ label: nombreMes(e.mes).slice(0, 3), value: e.inscriptos, value2: e.asistentes }))}
            leyenda={["Inscriptos", "Asistentes"]}
          />
          <p className="mt-3 text-xs text-gris">
            Actividades por mes: {evo.map((e) => `${nombreMes(e.mes).slice(0, 3)} ${e.actividades}`).join(" · ")}
          </p>
        </ChartCard>
      </div>}
    </>
  );
}
