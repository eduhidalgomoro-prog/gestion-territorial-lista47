import Link from "next/link";
import { IconAlert, IconCalendar, IconClock, IconPin } from "@/components/icons";
import { cx, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { ubicacionLabel } from "@/lib/labels";
import { COLOR_ESTADO, fechaHoraCorta, resumenLogistico } from "@/lib/logistica";
import { puede } from "@/lib/permisos";
import { nombreCorto } from "@/lib/taller-nombre";
import { formatDate, titleCase, today } from "@/lib/util";
import { qs, sp, type SP } from "@/lib/view";

export const metadata = { title: "Logística" };

const FILTROS = [
  { id: "", label: "Todas" },
  { id: "entregar", label: "Por entregar" },
  { id: "devolver", label: "Por devolver" },
] as const;

/**
 * Panel de Logística: qué hay que preparar y entregar, y quién tiene cada elemento.
 * Muestra las próximas actividades que piden elementos y, aunque ya hayan pasado,
 * las que todavía tienen algo sin devolver.
 */
export default async function Logistica({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  if (!puede.gestionarLogistica(yo)) return <Notice tone="alerta">Esta sección es para el equipo de Logística.</Notice>;
  const q = await searchParams;
  const filtro = sp(q, "f");
  const s = await snapshot();
  const hoy = today();

  const conResumen = s.actividades
    .filter((a) => a.estado !== "CANCELADA" && a.estado !== "BORRADOR")
    .map((a) => ({ a, r: resumenLogistico(a, s.requerimientos, s.logistica, hoy) }))
    .filter(({ a, r }) => r.requiere && ((a.fecha && a.fecha >= hoy) || r.enCirculacion > 0));
  // Primero lo que tiene algo afuera y ya pasó; después lo más próximo.
  const lista = conResumen.sort((x, y) => (x.a.fecha || "9999").localeCompare(y.a.fecha || "9999"));

  const proximas = lista.filter(({ a }) => a.fecha >= hoy);
  const porEntregar = proximas.filter(({ r }) => r.porEntregar > 0);
  const porDevolver = lista.filter(({ r }) => r.enCirculacion > 0);
  const enCirculacion = lista.reduce((n, { r }) => n + r.enCirculacion, 0);
  const visibles = filtro === "entregar" ? porEntregar : filtro === "devolver" ? porDevolver : lista;

  // Quién tiene cada elemento: una fila por actividad y elemento que sigue afuera.
  const pendientes = porDevolver
    .flatMap(({ a, r }) => r.filas.filter((f) => f.enCirculacion > 0).map((f) => ({ a, f })))
    .sort((x, y) => x.f.ultimaEntrega.localeCompare(y.f.ultimaEntrega));

  return (
    <div className="mx-auto max-w-4xl pb-6">
      <header className="mb-4">
        <p className="text-[12px] font-extrabold tracking-[0.16em] text-marca uppercase">Logística</p>
        <h1 className="font-titulo text-[30px] leading-tight font-extrabold text-petroleo-600">Entregas y devoluciones</h1>
      </header>

      {/* Indicadores */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile n={proximas.length} label="Próximas con logística" href={`/logistica`} />
        <Tile n={porEntregar.length} label="Entregas pendientes" tono={porEntregar.length ? "alerta" : undefined} href={`/logistica${qs({ f: "entregar" })}`} />
        <Tile n={enCirculacion} label="Elementos en circulación" />
        <Tile n={porDevolver.length} label="Devoluciones pendientes" tono={porDevolver.length ? "alerta" : undefined} href={`/logistica${qs({ f: "devolver" })}`} />
      </div>

      {/* Quién tiene qué */}
      {pendientes.length > 0 && (
        <section className="mb-6 rounded-[22px] bg-white p-4 ring-1 ring-alerta/30">
          <h2 className="mb-2 flex items-center gap-2 text-[17px] font-extrabold text-alerta">
            <IconAlert size={20} /> Elementos pendientes de devolución
          </h2>
          <ul className="divide-y divide-linea">
            {pendientes.map(({ a, f }) => (
              <li key={`${a.id}-${f.elemento}`}>
                <Link href={`/actividades/${a.id}/logistica`} className="flex items-center gap-3 py-3 hover:bg-fondo/60">
                  <span className="flex min-w-14 shrink-0 flex-col items-center rounded-xl bg-alerta-50 px-2 py-1.5 text-alerta">
                    <b className="font-titulo text-[20px] leading-none tabular-nums">{f.enCirculacion}</b>
                    <span className="text-[11px] font-bold uppercase">sin volver</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-extrabold">{f.elemento}</span>
                    <span className="block text-[14px] text-gris">
                      Lo tiene: <b className="text-tinta">{f.quienTiene.join(", ") || "—"}</b>
                      {a.responsable && ` · Responsable: ${titleCase(a.responsable)}`}
                    </span>
                    <span className="block truncate text-[13.5px] text-gris">
                      {nombreCorto(a.nombre)} · entregado {fechaHoraCorta(f.ultimaEntrega)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actividades */}
      <nav className="mb-3 flex flex-wrap gap-2" aria-label="Filtrar">
        {FILTROS.map((x) => (
          <Link
            key={x.id}
            href={`/logistica${qs({ f: x.id })}`}
            aria-current={filtro === x.id ? "page" : undefined}
            className={cx("inline-flex h-10 items-center rounded-full px-4 text-[14px] font-bold", filtro === x.id ? "bg-petroleo text-white" : "bg-white ring-1 ring-linea hover:ring-petroleo/50")}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {visibles.length === 0 ? (
        <p className="rounded-[22px] bg-white p-6 text-center text-[16px] text-gris ring-1 ring-linea/70">
          {filtro === "devolver" ? "✓ No hay elementos sin devolver." : filtro === "entregar" ? "✓ No hay entregas pendientes." : "No hay próximas actividades que pidan elementos."}
        </p>
      ) : (
        <ul className="grid items-start gap-3 lg:grid-cols-2">
          {visibles.map(({ a, r }) => {
            const paso = a.fecha && a.fecha < hoy;
            return (
              <li key={a.id}>
                <Link href={`/actividades/${a.id}/logistica`} className="block rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(16,105,133,0.06)] ring-1 ring-linea/70 transition hover:ring-petroleo/40">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[12px] font-extrabold tracking-wide text-petroleo uppercase">{ubicacionLabel(a)}</span>
                    <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold uppercase", COLOR_ESTADO[r.estado])}>{r.estado}</span>
                  </div>
                  <p className="mt-1.5 font-titulo text-[18px] leading-snug font-extrabold">{nombreCorto(a.nombre)}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[14.5px]">
                    <span className={cx("inline-flex items-center gap-1 font-bold", paso ? "text-alerta" : "text-petroleo-600")}>
                      <IconCalendar size={16} /> {a.fecha ? formatDate(a.fecha, { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "") : "Sin fecha"}
                      {paso && " · ya pasó"}
                    </span>
                    {a.hora_inicio && <span className="inline-flex items-center gap-1 text-gris"><IconClock size={16} /> {a.hora_inicio}</span>}
                  </p>
                  {(a.lugar || a.direccion) && (
                    <p className="mt-0.5 flex items-start gap-1 text-[14px] text-gris"><IconPin size={16} className="mt-0.5 shrink-0" /> {[a.lugar, a.direccion].filter(Boolean).join(" · ")}</p>
                  )}
                  {a.responsable && <p className="text-[14px] text-gris">Responsable: <b className="text-tinta">{titleCase(a.responsable)}</b></p>}
                  {r.filas.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.filas.map((f) => (
                        <span
                          key={f.elemento}
                          className={cx(
                            "rounded-full px-2.5 py-1 text-[12.5px] font-bold",
                            f.enCirculacion > 0 ? "bg-alerta-50 text-alerta" : f.porEntregar > 0 ? "bg-[#eef1f5] text-[#4a5568]" : "bg-verde-50 text-marca-600",
                          )}
                        >
                          {f.elemento} {f.solicitado > 0 ? `${f.entregado}/${f.solicitado}` : `×${f.entregado}`}
                          {f.enCirculacion > 0 && ` · ${f.enCirculacion} afuera`}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Tile({ n, label, tono, href }: { n: number; label: string; tono?: "alerta"; href?: string }) {
  const contenido = (
    <>
      <span className={cx("block font-titulo text-[30px] leading-none font-extrabold tabular-nums", tono === "alerta" ? "text-alerta" : "text-petroleo-600")}>{n}</span>
      <span className="mt-1.5 block text-[13px] leading-tight font-bold text-gris">{label}</span>
    </>
  );
  const cls = cx("block rounded-[20px] bg-white p-3.5 ring-1", tono === "alerta" ? "ring-alerta/30" : "ring-linea/70", href && "transition hover:ring-petroleo/50");
  return href ? <Link href={href} className={cls}>{contenido}</Link> : <div className={cls}>{contenido}</div>;
}
