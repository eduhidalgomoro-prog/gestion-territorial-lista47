import Link from "next/link";
import { Barras, BarrasDobles } from "@/components/charts";
import { Bloque, Cobertura, ComparacionTarjetas, CostosResumen, InscriptosAsistentes, NuevosRecurrentes, ResumenEstadistico, Tarjeta, TopBarras, Vacio, type FilaComparacion } from "@/components/estadisticas";
import { EvolucionMensual } from "@/components/evolucion";
import { FiltroSelect, FiltrosForm } from "@/components/filtros";
import { AvanceZonas, Destacados } from "@/components/inicio";
import { cx, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { agrupar, cumplimiento, evolucion, filtrarActividades, indicadores, inscriptosVsAsistentes, participantesPor, porZona } from "@/lib/domain/metricas";
import { conclusionesEstadisticas } from "@/lib/domain/resumen";
import { MarcandoHuellasStats } from "@/components/huellas";
import { esMarcandoHuellas, resumenHuellas } from "@/lib/huellas";
import { opcionesZona, titulo, zonaLabel } from "@/lib/labels";
import { actividadesVisibles, puede, zonaForzada } from "@/lib/permisos";
import { ESTADOS_ACTIVIDAD, ZONAS } from "@/lib/schema";
import { ambitoDe, parseRegiones } from "@/lib/territorio";
import { addMonths, formatMoney, MESES, nombreMes, titleCase, today } from "@/lib/util";
import { periodo, sp, type SP } from "@/lib/view";

export const metadata = { title: "Estadísticas" };

/**
 * Estadísticas como resumen de gestión: primero cómo viene el período y lo más importante,
 * después Territorio, Participación, Evolución y Costos. Mismos cálculos de siempre (lib/domain/metricas).
 */
export default async function Estadisticas({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  if (!puede.verEstadisticas(yo)) return <Notice tone="alerta">Tu rol no tiene acceso a estadísticas.</Notice>;
  const q = await searchParams;
  const { anio, mes } = periodo(q);
  const zonaFija = zonaForzada(yo);
  const zona = zonaFija || sp(q, "zona");
  // Mes de comparación: por defecto, el anterior.
  const refMes = mes || Number(today().slice(5, 7));
  const prev = addMonths(anio, refMes, -1);
  const compMes = Number(sp(q, "cmes")) || prev.mes;
  const compAnio = Number(sp(q, "canio")) || prev.anio;

  const s = await snapshot();
  const ambito = zonaFija ? "" : sp(q, "ambito");
  const extra = { localidad: sp(q, "localidad"), barrio: sp(q, "barrio"), tipo: sp(q, "tipo"), responsable: sp(q, "responsable"), estado: sp(q, "estado") };
  const deMiAlcance = actividadesVisibles(yo, s.actividades, s.asignaciones);
  // Todos los bloques usan la misma lista filtrada (el período se aplica después).
  const visibles = filtrarActividades(deMiAlcance, { zona, ...extra }).filter((a) => (ambito !== "capital" && ambito !== "interior") || ambitoDe(a.zona) === ambito);
  const delPeriodo = visibles.filter((a) => a.anio === anio && (!mes || a.mes === mes));
  const delComp = visibles.filter((a) => a.anio === compAnio && a.mes === compMes);
  const A = indicadores(delPeriodo, s, { anio, mes });
  const B = indicadores(delComp, s, { anio: compAnio, mes: compMes });
  const costos = puede.verCostos(yo);
  const evo = evolucion({ ...s, actividades: visibles }, { anio, mes: refMes }, 12);
  const etiqueta = mes ? `${nombreMes(mes)} ${anio}` : `Año ${anio}`;
  const nombreActual = mes ? nombreMes(mes).toLowerCase() : `año ${anio}`;
  const nombreAnterior = `${nombreMes(compMes).toLowerCase()}${compAnio !== anio ? ` ${compAnio}` : ""}`;
  const anioActual = Number(today().slice(0, 4));
  const anios = [anioActual - 1, anioActual, anioActual + 1].map((a) => [a, String(a)] as const);
  const noCanceladas = delPeriodo.filter((a) => a.estado !== "CANCELADA" && a.estado !== "BORRADOR");
  const operativosHuellas = delPeriodo.filter(esMarcandoHuellas);
  const rHuellas = resumenHuellas(operativosHuellas.map((a) => a.id), s.atenciones, s.animales);

  // Objetivo mensual por zona (solo Capital y con un mes elegido; respeta los filtros).
  const conObjetivo = !!mes && ambito !== "interior" && (!zona || (ZONAS as readonly string[]).includes(zona));
  const cumpl = conObjetivo ? cumplimiento(visibles, anio, mes, s.config.objetivo_mensual).filter((c) => !zona || c.zona === zona) : [];

  // Territorio
  const actsPorZona = porZona(delPeriodo).map((d) => ({ ...d, label: zonaLabel(d.label === "Sin zona" ? "" : d.label) })).sort((a, b) => b.value - a.value);
  const actsPorBarrio = agrupar(noCanceladas, (a) => titleCase(a.barrio)).map((d) => (d.label === "Sin dato" ? { ...d, label: "Sin barrio cargado" } : d));
  const actsPorTipo = agrupar(noCanceladas, (a) => a.tipo).map((d) => (d.label === "Sin dato" ? { ...d, label: "Sin tipo" } : d));
  const capitalEnAlcance = ambito !== "interior" && (!zona || ambitoDe(zona) === "capital");
  const cobertura = [
    { valor: new Set(noCanceladas.map((a) => a.barrio).filter(Boolean)).size, texto: "barrios alcanzados" },
    ...(capitalEnAlcance && !zonaFija && !zona
      ? [{ valor: ZONAS.filter((z) => noCanceladas.some((a) => a.zona === z)).length, texto: `de ${ZONAS.length} zonas de Capital con actividad` }]
      : []),
    { valor: new Set(noCanceladas.map((a) => a.localidad).filter(Boolean)).size, texto: "localidades del interior" },
  ];

  // Lo más importante (reglas, sin IA)
  const conclusiones = conclusionesEstadisticas({
    ind: A,
    anterior: mes ? B : null,
    nombreAnterior,
    zonas: cumpl.map((c) => ({ ...c, nombre: zonaLabel(c.zona) })),
    barrios: actsPorBarrio.filter((b) => b.label !== "Sin barrio cargado"),
  });

  const comparacion: FilaComparacion[] = [
    { titulo: "Actividades programadas", actual: A.programadas, anterior: B.programadas, mejorSiSube: true, unidad: (n) => `${n} ${n === 1 ? "actividad" : "actividades"}` },
    { titulo: "Realizadas", actual: A.realizadas, anterior: B.realizadas, mejorSiSube: true, unidad: (n) => `${n} ${n === 1 ? "realizada" : "realizadas"}` },
    { titulo: "Inscriptos", actual: A.inscriptos, anterior: B.inscriptos, mejorSiSube: true, unidad: (n) => `${n} ${n === 1 ? "inscripto" : "inscriptos"}` },
    { titulo: "Asistentes", actual: A.asistentes, anterior: B.asistentes, mejorSiSube: true, unidad: (n) => `${n} ${n === 1 ? "asistente" : "asistentes"}` },
    { titulo: "Personas nuevas", actual: A.personasNuevas, anterior: B.personasNuevas, mejorSiSube: true, unidad: (n) => `${n} ${n === 1 ? "persona" : "personas"}` },
    { titulo: "% de asistencia", actual: A.pctAsistencia, anterior: B.pctAsistencia, mejorSiSube: true, unidad: (n) => `${n} ${n === 1 ? "punto" : "puntos"}`, formato: (n) => `${n}%` },
    { titulo: "Suspendidas o canceladas", actual: A.suspendidas + A.canceladas, anterior: B.suspendidas + B.canceladas, mejorSiSube: false, unidad: (n) => `${n}` },
    ...(costos ? [{ titulo: "Costo real", actual: A.costoReal, anterior: B.costoReal, mejorSiSube: null, unidad: formatMoney, formato: formatMoney }] : []),
  ];

  // Opciones de los filtros (de lo que cada uno puede ver)
  const enAmbito = deMiAlcance.filter((a) => (ambito !== "capital" && ambito !== "interior") || ambitoDe(a.zona) === ambito);
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const filtrosExtra = [zonaFija ? "" : sp(q, "zona"), ...Object.values(extra), sp(q, "cmes"), sp(q, "canio")].filter(Boolean).length;
  const alcance = zona ? zonaLabel(zona) : ambito === "capital" ? "Capital" : ambito === "interior" ? "Interior" : "Toda la provincia";

  const costosPorZona = agrupar(noCanceladas, (a) => zonaLabel(a.zona), (a) => a.costo_estimado, (a) => a.costo_real).filter((d) => d.value || d.value2);
  const costosTop = noCanceladas.map((a) => ({ label: a.nombre, value: a.costo_real || a.costo_estimado })).filter((d) => d.value > 0).sort((x, y) => y.value - x.value).slice(0, 10);
  const participantesZona = participantesPor(delPeriodo, s, "zona").map((d) => ({ ...d, label: zonaLabel(d.label === "Sin zona" ? "" : d.label) }));
  const participantesBarrio = participantesPor(delPeriodo, s, "barrio").map((d) => ({ ...d, label: d.label === "Sin barrio" ? "Sin barrio cargado" : titleCase(d.label) }));
  const insVsAsis = inscriptosVsAsistentes(delPeriodo, s).filter((d) => d.value || d.value2).map((d) => ({ ...d, label: zonaLabel(d.label === "Sin zona" ? "" : d.label) }));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-3">
        <h1 className="font-titulo text-3xl font-extrabold tracking-tight">Estadísticas</h1>
        <p className="text-[16px] text-gris">{etiqueta} · {alcance}</p>
      </header>

      {/* Filtros: los principales a la vista; el resto en «Filtros». */}
      <FiltrosForm action="/estadisticas" className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <FiltroSelect chip name="mes" label="Mes" activo={false} value={mes} options={[[0, "Todo el año"] as const, ...MESES.map((m, i) => [i + 1, m] as const)]} />
          <FiltroSelect chip name="anio" label="Año" activo={false} value={anio} options={anios} />
          {!zonaFija && (
            <FiltroSelect chip name="ambito" label="Capital o interior" activo={false} value={ambito} placeholder="Toda la provincia" options={[["capital", "Capital"], ["interior", "Interior"]]} />
          )}
          <details className="group open:basis-full" open={filtrosExtra > 0}>
            <summary className={cx("inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold", filtrosExtra ? "border-petroleo bg-petroleo-50 text-petroleo-600" : "border-linea bg-white text-petroleo hover:border-petroleo")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
              Filtros{filtrosExtra ? ` (${filtrosExtra})` : ""}
            </summary>
            <div className="mt-2 flex flex-wrap gap-2 rounded-2xl bg-white p-3 ring-1 ring-linea">
              {!zonaFija && (
                <FiltroSelect chip name="zona" label="Zona" value={sp(q, "zona")} placeholder="Zona: todas" options={opcionesZona([...parseRegiones(s.config.regiones_interior).map((r) => r.nombre), ...s.actividades.map((a) => a.zona).filter((z) => z && ambitoDe(z) === "interior")])} />
              )}
              {uniq(enAmbito.map((a) => a.localidad)).length > 0 && (
                <FiltroSelect chip name="localidad" label="Localidad" value={extra.localidad} placeholder="Localidad: todas" options={uniq(enAmbito.map((a) => a.localidad)).map((l) => [l, l] as const)} />
              )}
              <FiltroSelect chip name="barrio" label="Barrio" value={extra.barrio} placeholder="Barrio: todos" options={uniq(enAmbito.map((a) => a.barrio)).map((b) => [b, titleCase(b)] as const)} />
              <FiltroSelect chip name="tipo" label="Tipo" value={extra.tipo} placeholder="Tipo: todos" options={uniq(enAmbito.map((a) => a.tipo)).map((t) => [t, t] as const)} />
              <FiltroSelect chip name="responsable" label="Responsable" value={extra.responsable} placeholder="Responsable: todos" options={uniq(enAmbito.map((a) => a.responsable)).map((r) => [r, r] as const)} />
              <FiltroSelect chip name="estado" label="Estado" value={extra.estado} placeholder="Estado: todos" options={ESTADOS_ACTIVIDAD.map((e) => [e, titulo(e)] as const)} />
              <span className="basis-full text-xs font-bold tracking-wide text-gris uppercase">Comparar con</span>
              <FiltroSelect chip name="cmes" label="Comparar con mes" activo={!!sp(q, "cmes")} value={compMes} options={MESES.map((m, i) => [i + 1, m] as const)} />
              <FiltroSelect chip name="canio" label="Comparar con año" activo={!!sp(q, "canio")} value={compAnio} options={anios} />
              {filtrosExtra > 0 && (
                <Link href={`/estadisticas?mes=${mes}&anio=${anio}${ambito ? `&ambito=${ambito}` : ""}`} className="inline-flex h-10 items-center px-2 text-sm font-bold text-petroleo hover:underline">
                  Limpiar filtros
                </Link>
              )}
            </div>
          </details>
        </div>
      </FiltrosForm>

      <div className="space-y-7">
        {/* 1. Resumen del período */}
        <ResumenEstadistico titulo={etiqueta} ind={A} />

        {/* Lo más importante */}
        <Destacados items={conclusiones} titulo="Lo más importante" columnas={2} />

        {/* 2. Territorio */}
        <Bloque id="territorio" titulo="Territorio" resumen="Dónde estamos trabajando">
          {cumpl.length > 0 && (
            <div className="lg:col-span-2">
              <AvanceZonas data={cumpl} anio={anio} mes={mes} />
            </div>
          )}
          <Tarjeta titulo="Actividades por zona" nota="Sin contar borradores.">
            {actsPorZona.some((d) => d.value) ? <Barras data={actsPorZona} max={Math.max(...actsPorZona.map((d) => d.value))} /> : <Vacio />}
          </Tarjeta>
          <Tarjeta titulo="Cobertura territorial" nota="Lugares distintos con actividades (sin canceladas).">
            <Cobertura items={cobertura} />
          </Tarjeta>
          <Tarjeta titulo="Actividades por barrio">
            <TopBarras data={actsPorBarrio} color="#3f742c" verTodos="Ver todos los barrios" />
          </Tarjeta>
          <Tarjeta titulo="Actividades por tipo">
            <TopBarras data={actsPorTipo} color="#106985" />
          </Tarjeta>
        </Bloque>

        {/* 3. Participación */}
        <Bloque id="participacion" titulo="Participación" resumen="A cuántas personas estamos llegando">
          <Tarjeta titulo="Inscriptos y asistentes">
            <InscriptosAsistentes ind={A} />
          </Tarjeta>
          <Tarjeta titulo="Personas nuevas y recurrentes" nota="Personas distintas inscriptas en el período.">
            <NuevosRecurrentes ind={A} />
          </Tarjeta>
          <Tarjeta titulo="Inscriptos y asistentes por zona">
            {insVsAsis.some((d) => d.value || d.value2) ? <BarrasDobles data={insVsAsis} leyenda={["Inscriptos", "Asistentes"]} /> : <Vacio />}
          </Tarjeta>
          <Tarjeta titulo="Personas que asistieron, por zona" nota="Cada persona cuenta una vez.">
            <TopBarras data={participantesZona} />
          </Tarjeta>
          <Tarjeta titulo="Personas que asistieron, por barrio donde viven" ancha>
            <TopBarras data={participantesBarrio} color="#3f742c" verTodos="Ver todos los barrios" />
          </Tarjeta>
        </Bloque>

        {/* Marcando Huellas: modelo propio (atenciones y animales), separado de inscripción y asistencia. */}
        {operativosHuellas.length > 0 && (
          <Bloque
            id="huellas"
            titulo="Marcando Huellas"
            resumen={`${operativosHuellas.length} ${operativosHuellas.length === 1 ? "operativo" : "operativos"} · ${rHuellas.animales} ${rHuellas.animales === 1 ? "animal atendido" : "animales atendidos"}`}
          >
            <div className="tema-huellas lg:col-span-2">
              <p className="mb-3 text-[15px] text-gris">
                <b className="text-tinta">{operativosHuellas.filter((a) => a.estado !== "BORRADOR" && a.estado !== "CANCELADA").length}</b> operativos programados ·{" "}
                <b className="text-tinta">{operativosHuellas.filter((a) => a.estado === "REALIZADA").length}</b> realizados. No tienen inscripción: no cuentan en el % de asistencia.
              </p>
              <MarcandoHuellasStats r={rHuellas} conOperativos />
            </div>
          </Bloque>
        )}

        {/* 4. Evolución */}
        <Bloque id="evolucion" titulo="Evolución" resumen={`Comparación con ${nombreAnterior} y últimos 12 meses`}>
          <Tarjeta titulo={`Comparación con ${nombreAnterior}`} nota={B.total ? undefined : `No hay actividades cargadas en ${nombreAnterior}.`} ancha>
            <ComparacionTarjetas filas={comparacion} nombreActual={nombreActual} nombreAnterior={nombreAnterior} />
          </Tarjeta>
          <Tarjeta titulo="Evolución mensual" nota="Últimos 12 meses." ancha>
            <EvolucionMensual
              actividades={evo.map((e) => ({ label: `${nombreMes(e.mes).slice(0, 3)}${e.mes === 1 ? ` ${String(e.anio).slice(2)}` : ""}`, value: e.actividades, value2: e.realizadas }))}
              participacion={evo.map((e) => ({ label: `${nombreMes(e.mes).slice(0, 3)}${e.mes === 1 ? ` ${String(e.anio).slice(2)}` : ""}`, value: e.inscriptos, value2: e.asistentes }))}
            />
          </Tarjeta>
        </Bloque>

        {/* Costos: secundario */}
        {costos && (
          <Bloque id="costos" titulo="Costos" resumen={A.costoReal || A.costoEstimado ? `Estimado ${formatMoney(A.costoEstimado)} · Real ${A.costoReal ? formatMoney(A.costoReal) : "—"}` : "Sin costos registrados"} abierto={false}>
            <Tarjeta titulo={`Costos de ${nombreActual}`} ancha>
              <CostosResumen ind={A} />
            </Tarjeta>
            {costosPorZona.length > 0 && (
              <Tarjeta titulo="Costos por zona">
                <BarrasDobles data={costosPorZona} leyenda={["Estimado", "Real"]} format={formatMoney} colores={["#9bb8c4", "#106985"]} />
              </Tarjeta>
            )}
            {costosTop.length > 0 && (
              <Tarjeta titulo="Actividades con más costo">
                <TopBarras data={costosTop} format={formatMoney} n={5} />
              </Tarjeta>
            )}
          </Bloque>
        )}
      </div>
    </div>
  );
}
