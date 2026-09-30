import Link from "next/link";
import { FiltroSelect, FiltrosForm } from "@/components/filtros";
import { FlyersActividad } from "@/components/flyer-imagen";
import { esFlyerSubido } from "@/lib/flyers";
import { ActionForm, Input, Select, SubmitButton } from "@/components/forms";
import { IconWhatsApp } from "@/components/icons";
import { Badge, btn, cx, Empty, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { FLYER_COLOR, opcionesZona, ubicacionLabel, zonaLabel } from "@/lib/labels";
import { ambitoDe, parseRegiones } from "@/lib/territorio";
import { actividadesVisibles, esResponsable, puede } from "@/lib/permisos";
import { ESTADOS_FLYER, type Actividad, type EstadoFlyer, type Usuario } from "@/lib/schema";
import { formatDate, MESES, nombreMes, normalizePhone, titleCase, today } from "@/lib/util";
import { periodo, sp, type SP } from "@/lib/view";
import { flyerAction } from "../actions";

export const metadata = { title: "Flyers" };

const ORDEN: EstadoFlyer[] = ["SOLICITADO", "EN DISEÑO", "PARA APROBACIÓN", "APROBADO", "PUBLICADO"];

/** Link de WhatsApp al responsable con el mensaje ya escrito. */
function whatsapp(u: Usuario, a: Actividad): string {
  const tel = normalizePhone(u.telefono);
  const cuando = [a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "", a.hora_inicio ? `${a.hora_inicio} h` : ""].filter(Boolean).join(", ");
  const links = [
    a.link_flyer ? `📱 Feed: ${a.link_flyer}` : "",
    a.link_flyer_historia ? `📲 Historias: ${a.link_flyer_historia}` : "",
  ].filter(Boolean);
  const texto = links.length
    ? `Hola ${u.nombre} 👋 Ya está el flyer de *${a.nombre}* (${cuando}, ${ubicacionLabel(a)}):\n${links.join("\n")}`
    : `Hola ${u.nombre} 👋 Te cuento cómo va el flyer de *${a.nombre}* (${cuando}, ${ubicacionLabel(a)}): ${a.estado_flyer.toLowerCase()}.`;
  return `https://wa.me/549${tel}?text=${encodeURIComponent(texto)}`;
}

export default async function Flyers({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  if (!puede.verFlyers(yo)) return <Notice tone="alerta">Tu rol no tiene acceso a la gestión de flyers.</Notice>;
  const q = await searchParams;
  const { anio, mes } = periodo(q);
  const zona = sp(q, "zona");
  const s = await snapshot();
  const lista = actividadesVisibles(yo, s.actividades, s.asignaciones)
    .filter((a) => a.requiere_flyer && a.estado !== "CANCELADA" && a.estado !== "BORRADOR")
    .filter((a) => a.anio === anio && (!mes || a.mes === mes))
    .filter((a) => !zona || a.zona === zona)
    .sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio));
  const responsables = s.usuarios.filter((u) => u.estado === "ACTIVO" && u.rol === "RESPONSABLE");
  const porEstado = new Map<EstadoFlyer, Actividad[]>(ORDEN.map((e) => [e, []]));
  for (const a of lista) porEstado.get((a.estado_flyer || "SOLICITADO") as EstadoFlyer)!.push(a);
  const anioActual = Number(today().slice(0, 4));
  const pendientes = lista.filter((a) => a.estado_flyer !== "PUBLICADO").length;

  return (
    <>
      <PageHeader
        kicker="Comunicación"
        title="Flyers"
        subtitle={`${lista.length} ${lista.length === 1 ? "actividad pide" : "actividades piden"} flyer ${mes ? `en ${nombreMes(mes).toLowerCase()}` : `en ${anio}`}${pendientes ? ` · ${pendientes} sin publicar` : ""}`}
      />

      <FiltrosForm action="/flyers" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:max-w-2xl">
        <FiltroSelect name="mes" label="Mes" value={mes} options={[[0, "Todo el año"] as const, ...MESES.map((m, i) => [i + 1, m] as const)]} />
        <FiltroSelect name="anio" label="Año" value={anio} options={[anioActual - 1, anioActual, anioActual + 1].map((a) => [a, String(a)] as const)} />
        {!esResponsable(yo) && (
          <FiltroSelect name="zona" label="Zona" value={zona} placeholder="Todas las zonas" options={opcionesZona([...parseRegiones(s.config.regiones_interior).map((r) => r.nombre), ...s.actividades.map((a) => a.zona).filter((z) => z && ambitoDe(z) === "interior")])} />
        )}
      </FiltrosForm>

      {/* Resumen por estado */}
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Estados">
        {ORDEN.map((e) => (
          <a key={e} href={`#${e.replace(/\s/g, "-")}`} className="inline-flex items-center gap-1.5 rounded-full border border-linea bg-white px-3 py-1.5 text-sm font-semibold hover:border-petroleo">
            <Badge color={FLYER_COLOR[e]}>{porEstado.get(e)!.length}</Badge> {e.charAt(0) + e.slice(1).toLowerCase()}
          </a>
        ))}
      </nav>

      {lista.length === 0 ? (
        <Empty>No hay actividades que pidan flyer en este período.</Empty>
      ) : (
        <div className="space-y-6">
          {ORDEN.filter((e) => porEstado.get(e)!.length).map((e) => (
            <section key={e} id={e.replace(/\s/g, "-")} className="scroll-mt-20">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
                <Badge color={FLYER_COLOR[e]} className="text-sm">{e}</Badge>
                <span className="text-sm font-semibold text-gris">{porEstado.get(e)!.length}</span>
              </h2>
              <ul className="grid gap-3 lg:grid-cols-2">
                {porEstado.get(e)!.map((a) => {
                  const editable = puede.editarFlyer(yo, a);
                  // Actividad de una zona: su responsable. General o sin zona: todos los responsables.
                  const aQuien = responsables.filter(
                    (u) => (a.zona === "GENERAL" || !a.zona || u.zona === a.zona) && normalizePhone(u.telefono).length === 10,
                  );
                  return (
                    <li key={a.id} className="rounded-2xl border border-linea bg-white p-4">
                      {a.tipo && <p className="text-[11px] font-bold tracking-[0.12em] text-marca uppercase">{a.tipo}</p>}
                      <Link href={`/actividades/${a.id}`} className="font-titulo text-[17px] leading-snug font-bold hover:text-petroleo hover:underline">
                        {a.nombre}
                      </Link>
                      <dl className="mt-2 grid gap-x-3 gap-y-1 text-sm sm:grid-cols-2">
                        <Dato k="Cuándo" v={a.fecha ? `${formatDate(a.fecha, { weekday: "short", day: "numeric", month: "short" })}${a.hora_inicio ? ` · ${a.hora_inicio}${a.hora_fin ? `–${a.hora_fin}` : ""}` : ""}` : "Sin fecha"} />
                        <Dato k="Zona" v={`${ubicacionLabel(a)}${a.barrio ? ` · ${titleCase(a.barrio)}` : ""}`} />
                        <Dato k="Dónde" v={[a.lugar, a.direccion].filter(Boolean).join(" · ")} />
                        <Dato k="Público" v={titleCase(a.publico)} />
                        <Dato k="Responsable" v={a.responsable} />
                        {a.link_inscripcion && a.inscripcion_abierta && <Dato k="Inscripción" v={a.link_inscripcion} />}
                      </dl>
                      {a.detalle && (
                        <details className="mt-2 text-sm">
                          <summary className="cursor-pointer font-semibold text-petroleo">Ver detalle</summary>
                          <p className="mt-1 whitespace-pre-line text-gris">{a.detalle}</p>
                        </details>
                      )}
                      <FlyersActividad actividadId={a.id} feed={a.link_flyer} historia={a.link_flyer_historia} editable={editable} nombre={a.nombre} compacto />
                      {a.link_flyer && !esFlyerSubido(a.link_flyer) && (
                        <a href={a.link_flyer} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-bold text-petroleo underline">
                          Ver flyer (link)
                        </a>
                      )}

                      {editable && (
                        <ActionForm action={flyerAction.bind(null, a.id)} className="mt-3 grid gap-2 border-t border-linea pt-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-start">
                          <Select name="estado_flyer" defaultValue={a.estado_flyer || "SOLICITADO"} options={ESTADOS_FLYER.map((x) => [x, x] as const)} aria-label="Estado del flyer" className="h-11" />
                          {esFlyerSubido(a.link_flyer) ? (
                            <input type="hidden" name="link_flyer" value={a.link_flyer} />
                          ) : (
                            <Input name="link_flyer" type="url" defaultValue={a.link_flyer} placeholder="…o pegá un link (Drive, Canva)" aria-label="Link al flyer" className="h-11" />
                          )}
                          <SubmitButton size="md" pendingText="…">Guardar estado</SubmitButton>
                        </ActionForm>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {aQuien.map((u) => (
                          <a key={u.id} href={whatsapp(u, a)} target="_blank" rel="noopener noreferrer" className={cx(btn("secundario", "sm"), "border-[#1f8f4e]/40 text-[#1f8f4e]")}>
                            <IconWhatsApp size={18} /> Enviar a {u.nombre}
                          </a>
                        ))}
                        {aQuien.length === 0 && (
                          <p className="text-xs text-gris">
                            Para enviar por WhatsApp, falta cargar el teléfono del responsable{a.zona && a.zona !== "GENERAL" ? ` de ${zonaLabel(a.zona)}` : ""} en Configuración → Usuarios.
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-gris">{k}:</dt>
      <dd className="min-w-0 font-semibold break-words">{v}</dd>
    </div>
  );
}
