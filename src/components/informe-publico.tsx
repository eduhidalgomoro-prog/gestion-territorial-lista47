import { Barras, ChartCard } from "./charts";
import { conclusiones, type Informe } from "@/lib/informe";

const COLOR = "#0b7ea6"; // un solo tono (validado contra fondo claro y oscuro)

const conPorcentaje = (total: number) => (n: number) => `${n} · ${total ? Math.round((n / total) * 100) : 0}%`;

/**
 * Informe del público de una actividad: lo ven los encargados en la app y el disertante por su link.
 * Solo cantidades y respuestas sin nombre.
 */
export function InformePublico({ informe }: { informe: Informe }) {
  const { inscriptos } = informe;
  const principales = conclusiones(informe);
  if (!inscriptos) return <p className="rounded-2xl border border-linea bg-white p-5 text-center text-gris">Todavía no hay inscriptos para armar el informe.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-linea bg-white p-4">
          <p className="text-xs font-bold tracking-wide text-gris uppercase">Inscriptos</p>
          <p className="font-titulo text-4xl font-black tabular-nums">{inscriptos}</p>
        </div>
        <div className="rounded-2xl border border-linea bg-white p-4">
          <p className="text-xs font-bold tracking-wide text-gris uppercase">En lista de espera</p>
          <p className="font-titulo text-4xl font-black tabular-nums">{informe.enEspera}</p>
        </div>
      </div>

      {principales.length > 0 && (
        <section className="break-inside-avoid rounded-2xl border border-petroleo/25 bg-petroleo-50 p-4 sm:p-5">
          <h2 className="mb-2 font-titulo text-lg font-extrabold text-petroleo-600">Lo principal</h2>
          <ul className="space-y-2.5">
            {principales.map((c) => (
              <li key={c.sobre} className="flex gap-2.5">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-petroleo" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-gris">{c.sobre}</span>
                  <span className="block text-[15.5px] leading-snug text-tinta">{c.texto}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gris">Resumen automático con los mismos números de los gráficos.</p>
        </section>
      )}

      {informe.preguntas.map((p) => (
        <ChartCard key={p.texto} title={p.texto} className="break-inside-avoid">
          <p className="-mt-2 mb-3 text-xs text-gris">
            Respondieron {p.respondieron} de {inscriptos}
          </p>
          {p.opciones ? (
            <Barras data={p.opciones} format={conPorcentaje(p.respondieron)} color={COLOR} max={Math.max(1, p.respondieron)} envolver vacio="Nadie respondió todavía." />
          ) : p.libres.length ? (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto print:max-h-none print:overflow-visible">
              {p.libres.map((r, i) => (
                <li key={i} className="rounded-lg bg-fondo px-3 py-2 text-[14.5px] leading-snug whitespace-pre-line">{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gris">Nadie respondió todavía.</p>
          )}
        </ChartCard>
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Edades" className="break-inside-avoid">
          <Barras data={informe.edades} format={conPorcentaje(inscriptos)} color={COLOR} max={inscriptos} />
        </ChartCard>
        <ChartCard title="De dónde vienen" className="break-inside-avoid">
          <Barras data={informe.ciudades} format={conPorcentaje(inscriptos)} color={COLOR} max={inscriptos} envolver />
        </ChartCard>
        {informe.barrios.length > 0 && (
          <ChartCard title="Barrios" className="break-inside-avoid md:col-span-2">
            <Barras data={informe.barrios} format={conPorcentaje(inscriptos)} color={COLOR} max={inscriptos} envolver />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
