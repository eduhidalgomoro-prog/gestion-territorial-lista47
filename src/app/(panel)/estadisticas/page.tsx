import { Barras, BarrasDobles, ChartCard, Columnas } from "@/components/charts";
import { FiltroSelect, FiltrosForm } from "@/components/filtros";
import { Notice, PageHeader, Stat, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { agrupar, evolucion, indicadores, inscriptosVsAsistentes, participantesPor, porZona, variacion, type Indicadores } from "@/lib/domain/metricas";
import { ZONA_HEX, zonaLabel } from "@/lib/labels";
import { actividadesVisibles, puede, zonaForzada } from "@/lib/permisos";
import { addMonths, formatMoney, formatNumber, MESES, nombreMes, titleCase, today } from "@/lib/util";
import { periodo, sp, type SP } from "@/lib/view";

export const metadata = { title: "Estadísticas" };

export default async function Estadisticas({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  if (!puede.verEstadisticas(yo)) return <Notice tone="alerta">Tu rol no tiene acceso a estadísticas.</Notice>;
  const q = await searchParams;
  const { anio, mes } = periodo(q);
  const zona = zonaForzada(yo) || sp(q, "zona");
  // Mes de comparación: por defecto, el anterior.
  const refMes = mes || Number(today().slice(5, 7));
  const prev = addMonths(anio, refMes, -1);
  const compMes = Number(sp(q, "cmes")) || prev.mes;
  const compAnio = Number(sp(q, "canio")) || prev.anio;

  const s = await snapshot();
  const visibles = actividadesVisibles(yo, s.actividades, s.asignaciones).filter((a) => !zona || a.zona === zona);
  const delPeriodo = visibles.filter((a) => a.anio === anio && (!mes || a.mes === mes));
  const delComp = visibles.filter((a) => a.anio === compAnio && a.mes === compMes);
  const A = indicadores(delPeriodo, s, { anio, mes });
  const B = indicadores(delComp, s, { anio: compAnio, mes: compMes });
  const costos = puede.verCostos(yo);
  const evo = evolucion({ ...s, actividades: visibles }, { anio, mes: refMes }, 12);
  const etiqueta = mes ? `${nombreMes(mes)} ${anio}` : `Año ${anio}`;
  const etiquetaB = `${nombreMes(compMes)} ${compAnio}`;
  const anioActual = Number(today().slice(0, 4));
  const anios = [anioActual - 1, anioActual, anioActual + 1].map((a) => [a, String(a)] as const);
  const noCanceladas = delPeriodo.filter((a) => a.estado !== "CANCELADA" && a.estado !== "BORRADOR");

  return (
    <>
      <PageHeader title="Estadísticas" subtitle={`${etiqueta}${zona ? ` · ${zonaLabel(zona)}` : " · todas las zonas"}`} />

      <FiltrosForm action="/estadisticas" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <FiltroSelect name="mes" label="Mes" value={mes} options={[[0, "Todo el año"] as const, ...MESES.map((m, i) => [i + 1, m] as const)]} />
        <FiltroSelect name="anio" label="Año" value={anio} options={anios} />
        {!zonaForzada(yo) && (
          <FiltroSelect name="zona" label="Zona" value={zona} placeholder="Todas las zonas" options={["NORTE", "ESTE", "SUR", "GENERAL"].map((z) => [z, zonaLabel(z)] as const)} />
        )}
        <FiltroSelect name="cmes" label="Comparar con mes" value={compMes} options={MESES.map((m, i) => [i + 1, `vs. ${m}`] as const)} />
        <FiltroSelect name="canio" label="Comparar con año" value={compAnio} options={anios} />
      </FiltrosForm>

      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Actividades programadas" value={A.programadas} hint={`${A.realizadas} realizadas`} />
        <Stat label="Asistentes" value={formatNumber(A.asistentes)} tone="verde" hint={`${formatNumber(A.inscriptos)} inscriptos`} />
        <Stat label="% asistencia" value={`${A.pctAsistencia}%`} />
        <Stat label="Personas nuevas" value={formatNumber(A.personasNuevas)} hint={`${formatNumber(A.personasRecurrentes)} recurrentes`} />
        {costos && <Stat label="Costo estimado" value={formatMoney(A.costoEstimado)} />}
        {costos && <Stat label="Costo real" value={formatMoney(A.costoReal)} />}
        {costos && <Stat label="Costo promedio por actividad" value={formatMoney(A.costoPromedio)} hint="actividades realizadas con costo" />}
        <Stat label="Suspendidas / canceladas" value={`${A.suspendidas} / ${A.canceladas}`} tone={A.suspendidas + A.canceladas ? "alerta" : "gris"} />
      </section>

      <ChartCard title={`Comparación: ${etiqueta} vs. ${etiquetaB}`} className="mb-5">
        <Comparacion a={A} b={B} la={etiqueta} lb={etiquetaB} costos={costos} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Actividades por zona">
          <Barras data={porZona(delPeriodo).map((d) => ({ ...d, label: zonaLabel(d.label === "Sin zona" ? "" : d.label), color: ZONA_HEX[d.label] }))} />
        </ChartCard>
        <ChartCard title="Inscriptos vs. asistentes">
          <BarrasDobles data={inscriptosVsAsistentes(delPeriodo, s).map((d) => ({ ...d, label: zonaLabel(d.label === "Sin zona" ? "" : d.label) }))} leyenda={["Inscriptos", "Asistentes"]} />
        </ChartCard>
        <ChartCard title="Actividades por barrio">
          <Barras data={agrupar(noCanceladas, (a) => titleCase(a.barrio)).slice(0, 12)} color="#3f742c" />
        </ChartCard>
        <ChartCard title="Actividades por tipo">
          <Barras data={agrupar(noCanceladas, (a) => a.tipo)} color="#106985" />
        </ChartCard>
        <ChartCard title="Evolución mensual (12 meses)" className="lg:col-span-2">
          <Columnas data={evo.map((e) => ({ label: `${nombreMes(e.mes).slice(0, 3)}${e.mes === 1 ? ` ${String(e.anio).slice(2)}` : ""}`, value: e.actividades, value2: e.realizadas }))} leyenda={["Programadas", "Realizadas"]} />
          <div className="mt-5">
            <Columnas data={evo.map((e) => ({ label: nombreMes(e.mes).slice(0, 3), value: e.inscriptos, value2: e.asistentes }))} leyenda={["Inscriptos", "Asistentes"]} colores={["#9bb8c4", "#3f742c"]} />
          </div>
        </ChartCard>
        {costos && (
          <ChartCard title="Costos por zona">
            <BarrasDobles
              data={agrupar(noCanceladas, (a) => zonaLabel(a.zona), (a) => a.costo_estimado, (a) => a.costo_real)}
              leyenda={["Estimado", "Real"]}
              format={formatMoney}
              colores={["#9bb8c4", "#106985"]}
            />
          </ChartCard>
        )}
        {costos && (
          <ChartCard title="Costos por actividad (las 10 más altas)">
            <Barras
              data={noCanceladas
                .map((a) => ({ label: a.nombre, value: a.costo_real || a.costo_estimado }))
                .filter((d) => d.value > 0)
                .sort((x, y) => y.value - x.value)
                .slice(0, 10)}
              format={formatMoney}
              color="#106985"
              vacio="Todavía no hay costos cargados en este período."
            />
          </ChartCard>
        )}
        <ChartCard title="Participantes (personas distintas que asistieron) por zona">
          <Barras data={participantesPor(delPeriodo, s, "zona").map((d) => ({ ...d, label: zonaLabel(d.label === "Sin zona" ? "" : d.label), color: ZONA_HEX[d.label] }))} />
        </ChartCard>
        <ChartCard title="Participantes por barrio (donde viven)">
          <Barras data={participantesPor(delPeriodo, s, "barrio").slice(0, 12).map((d) => ({ ...d, label: titleCase(d.label) }))} color="#3f742c" />
        </ChartCard>
      </div>
    </>
  );
}

function Comparacion({ a, b, la, lb, costos }: { a: Indicadores; b: Indicadores; la: string; lb: string; costos: boolean }) {
  const filas: { k: string; va: number; vb: number; fmt?: (n: number) => string; invertir?: boolean }[] = [
    { k: "Actividades", va: a.programadas, vb: b.programadas },
    { k: "Realizadas", va: a.realizadas, vb: b.realizadas },
    { k: "Inscriptos", va: a.inscriptos, vb: b.inscriptos },
    { k: "Asistentes", va: a.asistentes, vb: b.asistentes },
    { k: "Personas nuevas", va: a.personasNuevas, vb: b.personasNuevas },
    { k: "% asistencia", va: a.pctAsistencia, vb: b.pctAsistencia, fmt: (n) => `${n}%` },
    ...(costos ? [{ k: "Costo real", va: a.costoReal, vb: b.costoReal, fmt: formatMoney, invertir: true }] : []),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-[15px]">
        <thead>
          <tr className="text-xs text-gris uppercase">
            <th className="py-2 pr-2">Indicador</th>
            <th className="px-2 py-2 text-right">{la}</th>
            <th className="px-2 py-2 text-right">{lb}</th>
            <th className="py-2 pl-2 text-right">Variación</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const v = variacion(f.va, f.vb);
            const bueno = f.invertir ? v.diff < 0 : v.diff > 0;
            const fmt = f.fmt ?? formatNumber;
            return (
              <tr key={f.k} className="border-t border-linea">
                <td className="py-2.5 pr-2 font-semibold">{f.k}</td>
                <td className="px-2 py-2.5 text-right font-bold tabular-nums">{fmt(f.va)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-gris">{fmt(f.vb)}</td>
                <td className={cx("py-2.5 pl-2 text-right font-bold tabular-nums", v.diff === 0 ? "text-gris" : bueno ? "text-ok" : "text-alerta")}>
                  {v.diff === 0 ? "=" : `${v.diff > 0 ? "▲" : "▼"} ${f.fmt ? fmt(Math.abs(v.diff)) : Math.abs(v.diff)}`}
                  {v.pct !== null && v.diff !== 0 && <span className="ml-1 text-xs">({v.pct > 0 ? "+" : ""}{v.pct}%)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
