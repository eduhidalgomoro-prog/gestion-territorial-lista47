import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, Input, Select, SubmitButton } from "@/components/forms";
import { IconCheck, IconClipboard, IconEdit, IconForm, IconImage, IconLock, IconMap, IconPin, IconUpload, IconUsers, IconWhatsApp, IconX } from "@/components/icons";
import { mensajeActividad, whatsappCompartir } from "@/lib/compartir";
import { FlyersActividad } from "@/components/flyer-imagen";
import { esFlyerSubido } from "@/lib/flyers";
import { Badge, btn, Card, cx, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { ESTADO_COLOR, FLYER_COLOR, titulo, zonaLabel } from "@/lib/labels";
import { ambitoDe } from "@/lib/territorio";
import { esAgenda, puede } from "@/lib/permisos";
import { ESTADOS_FLYER, type EstadoActividad } from "@/lib/schema";
import { linkInscripcion, resumenAsistencia } from "@/lib/services/actividades";
import { formatDate, formatDateLong, formatMoney, titleCase } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { asignarOperadorAction, cambiarEstadoAction, flyerAction, formularioAction, quitarOperadorAction } from "../../actions";

const MENSAJES: Record<string, string> = {
  creada: "¡Actividad guardada! Ya quedó registrada en la planilla.",
  editada: "Cambios guardados.",
  cerrada: "Actividad cerrada: quedó como REALIZADA con sus resultados.",
  importada: "Inscriptos importados.",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // El nombre solo se muestra en la pestaña si el usuario tiene acceso a la actividad.
  const titulo = await Promise.all([requireUser(), snapshot()])
    .then(([yo, s]) => {
      const a = s.actividades.find((x) => x.id === id);
      return a && puede.verActividad(yo, a, s.asignaciones) ? a.nombre : "Actividad";
    })
    .catch(() => "Actividad");
  return { title: titulo };
}

export default async function FichaActividad({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const yo = await requireUser();
  const { id } = await params;
  const q = await searchParams;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();

  const r = resumenAsistencia(a.id, s);
  const editar = puede.editarActividad(yo, a);
  const asistencia = puede.tomarAsistencia(yo, a, s.asignaciones);
  const cerrar = puede.cerrarActividad(yo, a) && a.estado !== "CANCELADA";
  const costos = puede.verCostos(yo);
  const verInscriptos = puede.verInscriptos(yo, a, s.asignaciones);
  const editarFlyer = puede.editarFlyer(yo, a);
  // Agenda: ficha simplificada (sin logística ni formulario de inscripción).
  const agenda = esAgenda(yo);
  const reqs = s.requerimientos.filter((x) => x.actividad_id === a.id && x.estado !== "ANULADO");
  const inst = s.instituciones.find((i) => i.id === a.institucion_id);
  const asignaciones = s.asignaciones.filter((x) => x.actividad_id === a.id && x.estado === "ACTIVA");
  const operadores = s.usuarios.filter((u) => u.rol === "OPERADOR" && u.estado === "ACTIVO");
  const link = a.slug ? linkInscripcion(a.slug) : "";
  const ok = MENSAJES[sp(q, "ok")];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/actividades", label: "Actividades" }}
        kicker={a.tipo || "Actividad"}
        title={a.nombre}
        subtitle={<span className="font-mono text-xs">{a.id}</span>}
      />
      {ok && <Notice tone="ok" className="mb-4">{ok}</Notice>}

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge color={ESTADO_COLOR[a.estado]} className="text-sm">{a.estado}</Badge>
          <Badge color="petroleo" className="text-sm">{zonaLabel(a.zona)}</Badge>
          {ambitoDe(a.zona) === "interior" && <Badge color="verde" className="text-sm">Interior</Badge>}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
          {a.localidad && <Fila k="Localidad" v={a.localidad} />}
          <Fila k="Barrio" v={titleCase(a.barrio)} />
          <Fila k="Fecha" v={a.fecha ? <span className="first-letter:uppercase">{formatDateLong(a.fecha)}</span> : "Sin fecha"} />
          <Fila k="Horario" v={a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? ` – ${a.hora_fin}` : ""}` : ""} />
          <Fila k="Responsable" v={a.responsable} />
        </dl>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Numero n={r.inscriptos} label="Inscriptos" />
          <Numero n={r.presentes} label="Presentes" tono="verde" />
          <Numero n={a.estado === "REALIZADA" ? r.ausentes : r.ausentesMarcados} label="Ausentes" tono="gris" />
        </div>
        {r.inscriptos > 0 && a.estado === "REALIZADA" && <p className="mt-2 text-center text-sm font-semibold text-gris">Asistencia: {r.pct}%</p>}

        {costos && (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-linea pt-4 text-[15px]">
            <p>Costo estimado: <b>{formatMoney(a.costo_estimado)}</b></p>
            <p>Costo real: <b>{a.costo_real ? formatMoney(a.costo_real) : "—"}</b></p>
          </div>
        )}
      </Card>

      {/* Acciones principales */}
      <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Acciones de la actividad">
        {editar && <Accion href={`/actividades/${a.id}/editar`} Icon={IconEdit}>Editar actividad</Accion>}
        {verInscriptos && (a.es_feria || (editar && /feria/i.test(a.tipo + a.nombre))) && (
          <Accion href={`/actividades/${a.id}/feria`} Icon={IconPin} principal={a.es_feria}>{a.es_feria ? "Feria: puestos y croquis" : "Organizar como feria"}</Accion>
        )}
        {verInscriptos && <Accion href={`/actividades/${a.id}/inscriptos`} Icon={IconUsers}>Ver inscriptos</Accion>}
        {puede.verFlyers(yo) && a.requiere_flyer && <Accion href={`/flyers?mes=${a.mes || 0}&anio=${a.anio || ""}#${(a.estado_flyer || "SOLICITADO").replace(/\s/g, "-")}`} Icon={IconImage}>Flyer</Accion>}
        {asistencia && a.estado !== "CANCELADA" && <Accion href={`/actividades/${a.id}/asistencia`} Icon={IconClipboard} principal>Tomar asistencia</Accion>}
        {!agenda && <Accion href="#inscripcion" Icon={IconForm}>Formulario de inscripción</Accion>}
        <Accion href={`/mapa?foco=${a.id}&mes=${a.mes || ""}&anio=${a.anio || ""}`} Icon={IconMap}>Ver en mapa</Accion>
        <a
          href={whatsappCompartir(mensajeActividad(a, r))}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(btn("secundario", "lg"), "border-[#1f8f4e]/40 text-[14px] leading-tight text-[#1f8f4e] uppercase")}
        >
          <IconWhatsApp size={20} className="shrink-0" /> Compartir por WhatsApp
        </a>
        {cerrar && a.estado !== "REALIZADA" && <Accion href={`/actividades/${a.id}/cerrar`} Icon={IconLock}>Cerrar actividad</Accion>}
      </nav>

      {editar && a.estado !== "REALIZADA" && (
        <Seccion titulo="Estado de la actividad">
          <div className="flex flex-wrap gap-2">
            {(["PROGRAMADA", "CONFIRMADA", "SUSPENDIDA", "CANCELADA"] as EstadoActividad[])
              .filter((e) => e !== a.estado)
              .map((e) => (
                <ActionForm key={e} action={cambiarEstadoAction.bind(null, a.id, e)}>
                  <SubmitButton size="sm" variant={e === "CONFIRMADA" ? "primario" : e === "CANCELADA" ? "peligro" : "secundario"} pendingText="…">
                    {e === "CONFIRMADA" ? "✓ Confirmar" : `Pasar a ${titulo(e).toLowerCase()}`}
                  </SubmitButton>
                </ActionForm>
              ))}
          </div>
        </Seccion>
      )}

      <Seccion titulo="Información general">
        <dl className="space-y-2 text-[15px]">
          <Fila k="Detalle" v={a.detalle} multi />
          <Fila k="Tipo / programa" v={a.tipo} />
          <Fila k="Público dirigido" v={titleCase(a.publico)} />
          <Fila k="Fecha alternativa" v={a.fecha_alt ? `${formatDate(a.fecha_alt)} ${a.hora_alt}` : ""} />
          <Fila k="Cargada" v={[a.marca_temporal, a.creado_por, a.origen.startsWith("FORM:") ? "importada del formulario anterior" : ""].filter(Boolean).join(" · ")} />
          {a.observaciones && <Fila k="Observaciones" v={a.observaciones} multi />}
        </dl>
      </Seccion>

      <Seccion titulo="Ubicación">
        <dl className="space-y-2 text-[15px]">
          {a.localidad && <Fila k="Localidad" v={a.localidad} />}
          <Fila k="Barrio" v={titleCase(a.barrio)} />
          <Fila k="Dirección" v={a.direccion} />
          <Fila k="Entre calles" v={a.entre_calles} />
          <Fila k="Lugar" v={a.lugar} />
          <Fila k="Mapa" v={a.lat ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : "Sin ubicar"} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {a.lat !== 0 && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`} target="_blank" rel="noopener noreferrer" className={btn("secundario", "sm")}>
              Abrir en Google Maps
            </a>
          )}
          {editar && !a.lat && <Link href={`/actividades/${a.id}/editar?paso=2`} className={btn("secundario", "sm")}>Ubicar en el mapa</Link>}
        </div>
      </Seccion>

      {!agenda && <Seccion titulo="Requerimientos y logística">
        <ul className="grid gap-2 text-[15px] sm:grid-cols-2">
          <Req ok={a.gazebo} label={`Gazebos${a.gazebo ? `: ${a.gazebo_cant || "?"}` : ""}`} />
          <Req ok={a.mesas} label={`Mesas${a.mesas ? `: ${a.mesas_cant || "?"}` : ""}`} />
          <Req ok={a.sillas} label={`Sillas${a.sillas ? `: ${a.sillas_cant || "?"}` : ""}`} />
          <Req ok={a.luz} label="Bajada de luz" />
          <Req ok={a.sonido} label="Proyección y sonido" />
        </ul>
        {(reqs.length > 0 || a.otros_insumos) && (
          <div className="mt-4">
            <p className="mb-2 font-bold">Otros insumos</p>
            {reqs.length > 0 ? (
              <ul className="divide-y divide-linea rounded-xl border border-linea">
                {reqs.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[15px]">
                    <span>
                      {x.cantidad ? `${x.cantidad} × ` : ""}
                      {x.descripcion}
                      {x.tipo && <span className="text-sm text-gris"> · {titleCase(x.tipo)}</span>}
                    </span>
                    {costos && x.costo_estimado > 0 && <b>{formatMoney(x.costo_estimado)}</b>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] whitespace-pre-line">{a.otros_insumos}</p>
            )}
          </div>
        )}
        {a.obs_logistica && <p className="mt-3 text-[15px] whitespace-pre-line text-gris">{a.obs_logistica}</p>}
      </Seccion>}

      <Seccion titulo="Comunicación">
        {a.requiere_flyer ? (
          <>
            <p className="mb-3 text-[15px]">Flyer: {a.estado_flyer ? <Badge color={FLYER_COLOR[a.estado_flyer]}>{a.estado_flyer}</Badge> : "—"}</p>
            <div className="mb-3">
              <FlyersActividad actividadId={a.id} feed={a.link_flyer} historia={a.link_flyer_historia} editable={editarFlyer} nombre={a.nombre} />
            </div>
            {a.link_flyer && !esFlyerSubido(a.link_flyer) && (
              <a href={a.link_flyer} target="_blank" rel="noopener noreferrer" className={cx(btn("secundario", "sm"), "mb-3")}>
                <IconUpload size={18} /> Ver flyer (link)
              </a>
            )}
            {editarFlyer && (
              <ActionForm action={flyerAction.bind(null, a.id)} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <Select name="estado_flyer" defaultValue={a.estado_flyer || "SOLICITADO"} options={ESTADOS_FLYER.map((e) => [e, e] as const)} aria-label="Estado del flyer" />
                {esFlyerSubido(a.link_flyer) ? (
                  <input type="hidden" name="link_flyer" value={a.link_flyer} />
                ) : (
                  <Input name="link_flyer" type="url" defaultValue={a.link_flyer} placeholder="…o pegá un link (Drive, Canva)" aria-label="Link al flyer" />
                )}
                <SubmitButton size="md">Guardar estado</SubmitButton>
              </ActionForm>
            )}
          </>
        ) : (
          <p className="text-[15px] text-gris">No requiere flyer.</p>
        )}
      </Seccion>

      {!agenda && <Seccion titulo="Formulario de inscripción" id="inscripcion">
        {link ? (
          <>
            <p className="mb-2 text-[15px]">
              {a.inscripcion_abierta ? <Badge color="verde">ABIERTA</Badge> : <Badge color="gris">CERRADA</Badge>}{" "}
              Link público (sin usuario ni contraseña):
            </p>
            <p className="mb-3 rounded-xl bg-fondo px-3 py-2 font-mono text-sm break-all">{link}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={link} />
              <a href={`/inscripcion/${a.slug}`} target="_blank" rel="noopener noreferrer" className={btn("secundario", "sm")}>Ver formulario</a>
              {editar && (
                <ActionForm action={formularioAction.bind(null, a.id, !a.inscripcion_abierta)}>
                  <SubmitButton size="sm" variant={a.inscripcion_abierta ? "peligro" : "primario"} pendingText="…">
                    {a.inscripcion_abierta ? "Cerrar inscripción" : "Abrir inscripción"}
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
          </>
        ) : editar ? (
          <div>
            <p className="mb-3 text-[15px] text-gris">Generá un link público para que las personas se inscriban solas (pide nombre, apellido, DNI, teléfono y barrio).</p>
            <ActionForm action={formularioAction.bind(null, a.id, true)}>
              <SubmitButton size="md">Generar formulario de inscripción</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <p className="text-[15px] text-gris">Esta actividad no tiene formulario propio.</p>
        )}
        {puede.importar(yo, a) && (
          <p className="mt-4 text-[15px]">
            ¿Se inscribieron por Google Forms?{" "}
            <Link href={`/actividades/${a.id}/importar`} className="font-bold text-petroleo hover:underline">Importar Excel / CSV →</Link>
          </p>
        )}
      </Seccion>}

      <Seccion titulo="Instituciones relacionadas">
        {a.articula ? (
          <dl className="space-y-2 text-[15px]">
            <Fila k="Tipo de articulación" v={titleCase(a.tipo_articulacion)} />
            <Fila k="Mesa" v={titleCase(a.mesa)} />
            <Fila k="Institución" v={inst ? `${inst.nombre}${inst.tipo ? ` (${inst.tipo})` : ""}` : a.institucion_nombre} />
          </dl>
        ) : (
          <p className="text-[15px] text-gris">No articula con otras mesas ni instituciones.</p>
        )}
      </Seccion>

      {verInscriptos && <Seccion titulo="Participantes">
        <p className="text-[15px]">
          <b>{r.inscriptos}</b> inscriptos · <b>{r.presentes}</b> presentes
          {r.sinMarcar > 0 && a.estado !== "REALIZADA" && <> · <b>{r.sinMarcar}</b> sin marcar</>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/actividades/${a.id}/inscriptos`} className={btn("secundario", "sm")}>Ver listado</Link>
          {asistencia && a.estado !== "CANCELADA" && <Link href={`/actividades/${a.id}/asistencia`} className={btn("primario", "sm")}>Tomar asistencia</Link>}
        </div>
        {puede.asignarOperadores(yo, a) && (
          <div className="mt-5 border-t border-linea pt-4">
            <p className="mb-2 font-bold">Operadores asignados</p>
            {asignaciones.length === 0 && <p className="mb-2 text-sm text-gris">Nadie asignado. Los operadores solo ven las actividades que tienen asignadas.</p>}
            <ul className="mb-3 flex flex-wrap gap-2">
              {asignaciones.map((x) => {
                const u = s.usuarios.find((y) => y.id === x.usuario_id);
                return (
                  <li key={x.id} className="flex items-center gap-1 rounded-full bg-fondo py-1 pr-1 pl-3 text-sm font-semibold">
                    {u ? `${u.nombre} ${u.apellido}` : x.usuario_id}
                    <ActionForm action={quitarOperadorAction.bind(null, x.id)}>
                      <button type="submit" className="rounded-full p-1 text-gris hover:bg-white" aria-label="Quitar"><IconX size={16} /></button>
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
            {operadores.length > 0 ? (
              <ActionForm action={asignarOperadorAction.bind(null, a.id)} className="flex gap-2">
                <Select
                  name="usuario_id"
                  placeholder="Elegí un operador…"
                  options={operadores.filter((u) => !asignaciones.some((x) => x.usuario_id === u.id)).map((u) => [u.id, `${u.nombre} ${u.apellido}`] as const)}
                  aria-label="Operador"
                />
                <SubmitButton size="md">Asignar</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-gris">No hay usuarios con rol Operador. Se crean en Configuración.</p>
            )}
          </div>
        )}
      </Seccion>}

      {a.estado === "REALIZADA" && (
        <Seccion titulo="Resultados">
          <dl className="space-y-2 text-[15px]">
            <Fila k="Asistencia" v={`${a.presentes || r.presentes} de ${a.inscriptos || r.inscriptos} (${a.pct_asistencia || r.pct}%)`} />
            <Fila k="Resultados" v={a.resultados} multi />
            <Fila k="Incidencias" v={a.incidencias} multi />
            <Fila k="Fotos" v={a.fotos ? <Links texto={a.fotos} /> : ""} />
          </dl>
          {cerrar && <Link href={`/actividades/${a.id}/cerrar`} className={cx(btn("secundario", "sm"), "mt-3")}>Editar cierre</Link>}
        </Seccion>
      )}
    </div>
  );
}

function Fila({ k, v, multi }: { k: string; v: ReactNode; multi?: boolean }) {
  if (!v) return null;
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-gris">{k}</dt>
      <dd className={cx("min-w-0 font-semibold", multi && "font-normal whitespace-pre-line")}>{v}</dd>
    </div>
  );
}

function Numero({ n, label, tono }: { n: number; label: string; tono?: "verde" | "gris" }) {
  return (
    <div className={cx("rounded-2xl py-3", tono === "verde" ? "bg-verde-50 text-marca-600" : tono === "gris" ? "bg-fondo text-gris" : "bg-petroleo-50 text-petroleo-600")}>
      <p className="font-titulo text-3xl leading-none font-extrabold tabular-nums">{n}</p>
      <p className="mt-1 text-xs font-bold tracking-wide uppercase">{label}</p>
    </div>
  );
}

function Accion({ href, Icon, children, principal }: { href: string; Icon: typeof IconEdit; children: ReactNode; principal?: boolean }) {
  return (
    <Link href={href} className={cx(btn(principal ? "primario" : "secundario", "lg"), "text-[14px] leading-tight uppercase")}>
      <Icon size={20} className="shrink-0" /> {children}
    </Link>
  );
}

function Seccion({ titulo, children, id }: { titulo: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-4 scroll-mt-20 rounded-2xl border border-linea bg-white p-4 sm:p-5">
      <h2 className="mb-3 text-lg font-bold">{titulo}</h2>
      {children}
    </section>
  );
}

function Req({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cx("flex items-center gap-2", !ok && "text-gris")}>
      {ok ? <IconCheck size={18} className="text-marca" /> : <IconX size={18} />} {label}
    </li>
  );
}

function Links({ texto }: { texto: string }) {
  const items = texto.split(/\s+/).filter((t) => /^https?:\/\//.test(t));
  if (!items.length) return <>{texto}</>;
  return (
    <span className="flex flex-col gap-1">
      {items.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-petroleo underline">Foto / álbum {i + 1}</a>
      ))}
    </span>
  );
}
