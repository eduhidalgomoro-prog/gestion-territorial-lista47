import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, Input, Select, SubmitButton } from "@/components/forms";
import { IconCheck, IconEdit, IconForm, IconGazebo, IconImage, IconLock, IconMap, IconPin, IconUpload, IconUsers, IconWhatsApp, IconX } from "@/components/icons";
import { mensajeActividad, whatsappCompartir } from "@/lib/compartir";
import { FlyersActividad } from "@/components/flyer-imagen";
import { FlyerRapido } from "@/components/flyer-rapido";
import { esFlyerSubido } from "@/lib/flyers";
import { Badge, btn, Card, cx, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { ESTADO_COLOR, FLYER_COLOR, zonaLabel } from "@/lib/labels";
import { ambitoDe } from "@/lib/territorio";
import { MarcandoHuellasHeader, MarcandoHuellasStats } from "@/components/huellas";
import { CambiarEstado } from "@/components/cambiar-estado";
import { AccionAsistencia, AccionSec, ClasesTaller, TallerEncabezado } from "@/components/taller";
import { cantidadClases, claseActual, fechasDeClases } from "@/lib/clases";
import { COLOR_ESTADO, resumenLogistico } from "@/lib/logistica";
import { IconArrowLeft } from "@/components/icons";
import { esMarcandoHuellas, resumenHuellas } from "@/lib/huellas";
import { esAgenda, puede } from "@/lib/permisos";
import { ESTADOS_FLYER, type EstadoActividad } from "@/lib/schema";
import { asistenciaPorClase, linkInscripcion, resumenAsistencia } from "@/lib/services/actividades";
import { formatDate, formatDateLong, formatMoney, titleCase, today } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { asignarOperadorAction, flyerAction, formularioAction, quitarOperadorAction } from "../../actions";

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
  // Marcando Huellas: sin inscripción; se registran atenciones (persona → animales → prestaciones).
  const huellas = esMarcandoHuellas(a);
  const atencionesOp = huellas ? s.atenciones.filter((x) => x.actividad_id === a.id && x.activo).length : 0;
  // Transiciones de estado que permite la ficha (las mismas de siempre).
  const estadosPosibles = (["PROGRAMADA", "CONFIRMADA", "SUSPENDIDA", "CANCELADA"] as EstadoActividad[]).filter((e) => e !== a.estado);
  const asistenciaTomada = a.estado === "REALIZADA" || r.presentes + r.ausentesMarcados > 0;
  const abrir = sp(q, "abrir");
  // Entregas y devoluciones de elementos (mismos requerimientos de la actividad).
  const logistica = resumenLogistico(a, s.requerimientos, s.logistica, today());
  // Taller de varias clases: asistencia de cada clase.
  const clasesTaller = cantidadClases(a) > 1 ? asistenciaPorClase(a, s) : [];
  // Acceso rápido al flyer (mismos archivos que «Comunicación»). Si la actividad no pide flyer ni tiene uno, no se muestra.
  const flyerRapido =
    a.requiere_flyer || a.link_flyer || a.link_flyer_historia ? (
      <FlyerRapido
        nombre={a.nombre}
        estado={a.requiere_flyer ? a.estado_flyer || "SOLICITADO" : "PUBLICADO"}
        feed={a.link_flyer}
        historia={a.link_flyer_historia}
        comunicacionHref={editarFlyer ? `/actividades/${a.id}?abrir=comunicacion#comunicacion` : undefined}
      />
    ) : null;

  return (
    <div className={cx("mx-auto max-w-4xl", huellas && "tema-huellas")}>
      {huellas ? (
        <>
          <MarcandoHuellasHeader a={a} atenciones={atencionesOp} puedeRegistrar={asistencia} volver={{ href: "/actividades", label: "Actividades" }} />
          {ok && <Notice tone="ok" className="mb-4">{ok}</Notice>}
          {!agenda && <MarcandoHuellasStats r={resumenHuellas([a.id], s.atenciones, s.animales)} />}
          {agenda && <p className="mb-2 text-[16px] font-semibold">{resumenHuellas([a.id], s.atenciones, s.animales).animales} animales atendidos</p>}
        </>
      ) : (
        <>
          <Link href="/actividades" className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-petroleo hover:underline">
            <IconArrowLeft size={16} /> Actividades
          </Link>
          {ok && <Notice tone="ok" className="mb-4">{ok}</Notice>}
          {/* Centro de gestión: qué es → cuándo y dónde → estado → cuánta gente → qué hacer ahora. */}
          <TallerEncabezado
            a={a}
            estado={editar && a.estado !== "REALIZADA" ? <CambiarEstado actividadId={a.id} actual={a.estado} opciones={estadosPosibles} /> : null}
            numeros={{
              inscriptos: r.inscriptos,
              presentes: r.presentes,
              ausentes: a.estado === "REALIZADA" ? r.ausentes : r.ausentesMarcados,
              pct: a.estado === "REALIZADA" && r.inscriptos ? r.pct : asistenciaTomada && r.inscriptos ? Math.round((r.presentes / r.inscriptos) * 100) : null,
            }}
          />
          <div className="mt-4 space-y-2">
            {asistencia && a.estado !== "CANCELADA" &&
              (clasesTaller.length > 1 ? (
                <ClasesTaller id={a.id} clases={clasesTaller} actual={claseActual(fechasDeClases(a), today())} />
              ) : (
                <AccionAsistencia id={a.id} registrada={asistenciaTomada} presentes={r.presentes} />
              ))}
            {flyerRapido}
            <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Acciones de la actividad">
              {verInscriptos && <AccionSec href={`/actividades/${a.id}/inscriptos`} Icon={IconUsers}>Ver inscriptos</AccionSec>}
              {editar && <AccionSec href={`/actividades/${a.id}/editar`} Icon={IconEdit}>Editar</AccionSec>}
              {puede.gestionarLogistica(yo) && <AccionSec href={`/actividades/${a.id}/logistica`} Icon={IconGazebo}>Logística</AccionSec>}
              <AccionSec href={`/mapa?foco=${a.id}&mes=${a.mes || ""}&anio=${a.anio || ""}`} Icon={IconMap}>Ver mapa</AccionSec>
              <AccionSec href={whatsappCompartir(mensajeActividad(a, r))} Icon={IconWhatsApp} externo>Compartir actividad</AccionSec>
            </nav>
            {/* Lo menos frecuente, a un toque. */}
            <details className="group/mas">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 rounded-xl text-sm font-bold text-gris hover:text-petroleo [&::-webkit-details-marker]:hidden">
                <span className="group-open/mas:hidden">Más acciones</span>
                <span className="hidden group-open/mas:inline">Menos acciones</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="transition-transform group-open/mas:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
              </summary>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {verInscriptos && (a.es_feria || (editar && /feria/i.test(a.tipo + a.nombre))) && (
                  <AccionSec href={`/actividades/${a.id}/feria`} Icon={IconPin}>{a.es_feria ? "Feria: puestos" : "Organizar como feria"}</AccionSec>
                )}
                {puede.verFlyers(yo) && a.requiere_flyer && <AccionSec href={`/flyers?mes=${a.mes || 0}&anio=${a.anio || ""}#${(a.estado_flyer || "SOLICITADO").replace(/\s/g, "-")}`} Icon={IconImage}>Flyer</AccionSec>}
                {!agenda && <AccionSec href={`/actividades/${a.id}?abrir=inscripcion#inscripcion`} Icon={IconForm}>Formulario de inscripción</AccionSec>}
                {puede.importar(yo, a) && <AccionSec href={`/actividades/${a.id}/importar`} Icon={IconUpload}>Importar participantes</AccionSec>}
                {cerrar && a.estado !== "REALIZADA" && <AccionSec href={`/actividades/${a.id}/cerrar`} Icon={IconLock}>Cerrar actividad</AccionSec>}
              </div>
            </details>
          </div>
        </>
      )}

      {huellas && (
        <>
          <Card className="mt-4 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge color={ESTADO_COLOR[a.estado]} className="text-sm">{a.estado}</Badge>
              <Badge color="petroleo" className="text-sm">{zonaLabel(a.zona)}</Badge>
              {ambitoDe(a.zona) === "interior" && <Badge color="verde" className="text-sm">Interior</Badge>}
              {editar && a.estado !== "REALIZADA" && <CambiarEstado actividadId={a.id} actual={a.estado} opciones={estadosPosibles} />}
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
              {a.localidad && <Fila k="Localidad" v={a.localidad} />}
              <Fila k="Barrio" v={titleCase(a.barrio)} />
              <Fila k="Fecha" v={a.fecha ? <span className="first-letter:uppercase">{formatDateLong(a.fecha)}</span> : "Sin fecha"} />
              <Fila k="Horario" v={a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? ` – ${a.hora_fin}` : ""}` : ""} />
              <Fila k="Responsable" v={a.responsable} />
            </dl>
          </Card>
          {flyerRapido && <div className="mt-4">{flyerRapido}</div>}
          <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Acciones de la actividad">
            {editar && <Accion href={`/actividades/${a.id}/editar`} Icon={IconEdit}>Editar actividad</Accion>}
            {puede.verFlyers(yo) && a.requiere_flyer && <Accion href={`/flyers?mes=${a.mes || 0}&anio=${a.anio || ""}#${(a.estado_flyer || "SOLICITADO").replace(/\s/g, "-")}`} Icon={IconImage}>Flyer</Accion>}
            {puede.gestionarLogistica(yo) && <Accion href={`/actividades/${a.id}/logistica`} Icon={IconGazebo}>Logística</Accion>}
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
        </>
      )}

      <div className="mt-5 grid items-start gap-3 lg:grid-cols-2">
      <Seccion titulo="Información general" abierto>
        <dl className="space-y-3 text-[15px]">
          <Fila k="Detalle" v={a.detalle} multi />
          <Fila k="Tipo / programa" v={a.tipo} />
          <Fila k="Público" v={titleCase(a.publico)} />
          <Fila k="Responsable" v={a.responsable} />
          <Fila k="Fecha alternativa" v={a.fecha_alt ? `${formatDate(a.fecha_alt)} ${a.hora_alt}` : ""} />
          {a.observaciones && <Fila k="Observaciones" v={a.observaciones} multi />}
        </dl>
        <p className="mt-4 border-t border-linea pt-3 text-xs text-gris">
          {a.id}{[a.marca_temporal, a.creado_por, a.origen.startsWith("FORM:") ? "importada del formulario anterior" : ""].filter(Boolean).length ? " · Cargada " : ""}
          {[a.marca_temporal, a.creado_por, a.origen.startsWith("FORM:") ? "importada del formulario anterior" : ""].filter(Boolean).join(" · ")}
        </p>
      </Seccion>

      <Seccion titulo="Ubicación" resumen={[titleCase(a.barrio), a.direccion].filter(Boolean).join(" · ") || (a.lat ? "Ubicada en el mapa" : "Sin ubicar")}>
        <dl className="space-y-3 text-[15px]">
          {a.localidad && <Fila k="Localidad" v={a.localidad} />}
          <Fila k="Barrio" v={titleCase(a.barrio)} />
          <Fila k="Dirección" v={a.direccion} />
          <Fila k="Entre calles" v={a.entre_calles} />
          <Fila k="Lugar" v={a.lugar} />
          <Fila k="Zona" v={zonaLabel(a.zona)} />
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

      {!agenda && <Seccion
        titulo="Requerimientos y logística"
        resumen={[a.gazebo && "Gazebo", a.mesas && "Mesas", a.sillas && "Sillas", a.luz && "Luz", a.sonido && "Sonido", reqs.length && `${reqs.length} insumos`].filter(Boolean).join(" · ") || "Sin requerimientos"}
      >
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
        {logistica.requiere && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-fondo px-3 py-2.5">
            <p className="text-[15px]">
              Logística: <span className={cx("rounded-full px-2.5 py-0.5 text-[12.5px] font-extrabold uppercase", COLOR_ESTADO[logistica.estado])}>{logistica.estado}</span>
              {logistica.enCirculacion > 0 && <span className="ml-2 font-bold text-alerta">⚠ {logistica.enCirculacion} sin devolver</span>}
            </p>
            <Link href={`/actividades/${a.id}/logistica`} className="text-[14px] font-bold text-petroleo hover:underline">
              {puede.gestionarLogistica(yo) ? "Entregas y devoluciones →" : "Ver entregas →"}
            </Link>
          </div>
        )}
      </Seccion>}

      <Seccion titulo="Comunicación" id="comunicacion" abierto={abrir === "comunicacion"} resumen={a.requiere_flyer ? `Flyer: ${(a.estado_flyer || "solicitado").toLowerCase()}` : "No requiere flyer"}>
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

      {!agenda && !huellas && <Seccion
        titulo="Formulario de inscripción"
        id="inscripcion"
        abierto={abrir === "inscripcion"}
        resumen={link ? `${a.inscripcion_abierta ? "Abierto" : "Cerrado"} · ${r.inscriptos} ${r.inscriptos === 1 ? "inscripto" : "inscriptos"}` : "Sin formulario propio"}
      >
        {link ? (
          <>
            <p className="mb-3 flex flex-wrap items-center gap-2 text-[15px]">
              {a.inscripcion_abierta ? <Badge color="verde">ABIERTO</Badge> : <Badge color="gris">CERRADO</Badge>}
              <span><b>{r.inscriptos}</b> {r.inscriptos === 1 ? "inscripto" : "inscriptos"}</span>
            </p>
            <p className="mb-2 text-sm text-gris">Enlace de inscripción (sin usuario ni contraseña)</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={link} label="Copiar enlace" />
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
            <Link href={`/actividades/${a.id}/importar`} className="font-bold text-petroleo hover:underline">Importar participantes (Excel / CSV) →</Link>
          </p>
        )}
      </Seccion>}

      <Seccion titulo="Instituciones relacionadas" resumen={a.articula ? inst?.nombre || a.institucion_nombre || titleCase(a.mesa) || "Articula" : "No hay instituciones relacionadas"}>
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

      {verInscriptos && !huellas && <Seccion titulo="Participantes" resumen={asistenciaTomada ? "✓ Asistencia registrada" : r.sinMarcar > 0 ? `${r.sinMarcar} sin marcar` : "Ver inscriptos y asistencia"}>
        {asistenciaTomada && <p className="mb-3 flex items-center gap-1.5 font-bold text-marca-600"><IconCheck size={18} /> Asistencia registrada</p>}
        {!asistenciaTomada && r.sinMarcar > 0 && a.estado !== "REALIZADA" && <p className="mb-3 text-[15px] text-gris">{r.sinMarcar} {r.sinMarcar === 1 ? "persona sin marcar" : "personas sin marcar"}.</p>}
        <div className="flex flex-wrap gap-2">
          <Link href={`/actividades/${a.id}/inscriptos`} className={btn("secundario", "sm")}>Ver participantes</Link>
          {asistencia && a.estado !== "CANCELADA" && <Link href={`/actividades/${a.id}/asistencia`} className={btn("primario", "sm")}>{asistenciaTomada ? "Revisar asistencia" : "Tomar asistencia"}</Link>}
        </div>
      </Seccion>}

      {/* Equipo: en todas las actividades (en Marcando Huellas, el operador asignado es quien registra las atenciones). */}
      {(
        <Seccion titulo="Equipo asignado" abierto={huellas && puede.asignarOperadores(yo, a) && asignaciones.length === 0} resumen={[a.responsable, asignaciones.length && `${asignaciones.length} ${asignaciones.length === 1 ? "operador" : "operadores"}`].filter(Boolean).join(" · ") || "Sin equipo"}>
          <dl className="space-y-3 text-[15px]">
            <Fila k="Responsable" v={a.responsable || "—"} />
            {!puede.asignarOperadores(yo, a) && (
              <Fila k="Operadores" v={asignaciones.map((x) => { const u = s.usuarios.find((y) => y.id === x.usuario_id); return u ? `${u.nombre} ${u.apellido}` : x.usuario_id; }).join(", ") || "Nadie asignado"} />
            )}
          </dl>
        {puede.asignarOperadores(yo, a) && (
          <div className="mt-4 border-t border-linea pt-4">
            <p className="mb-2 font-bold">Operadores</p>
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
        </Seccion>
      )}

      {costos && (
        <Seccion titulo="Costos" resumen={a.costo_estimado || a.costo_real ? `Estimado ${formatMoney(a.costo_estimado)} · Real ${a.costo_real ? formatMoney(a.costo_real) : "—"}` : "Sin costos registrados"}>
          {a.costo_estimado || a.costo_real ? (
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-xs font-bold text-gris uppercase">Estimado</dt><dd className="font-titulo text-2xl font-extrabold">{formatMoney(a.costo_estimado)}</dd></div>
              <div><dt className="text-xs font-bold text-gris uppercase">Real</dt><dd className="font-titulo text-2xl font-extrabold">{a.costo_real ? formatMoney(a.costo_real) : "—"}</dd></div>
            </dl>
          ) : (
            <p className="text-[15px] text-gris">Sin costos registrados.</p>
          )}
        </Seccion>
      )}

      {a.estado === "REALIZADA" && (
        <Seccion titulo="Resultados" abierto>
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
    </div>
  );
}

/** Dato: en el celular, etiqueta chica arriba y valor abajo (más natural que una tabla). */
function Fila({ k, v, multi }: { k: string; v: ReactNode; multi?: boolean }) {
  if (!v) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="text-xs font-bold tracking-wide text-gris uppercase sm:w-32 sm:shrink-0 sm:pt-0.5 sm:text-[15px] sm:font-normal sm:tracking-normal sm:normal-case">{k}</dt>
      <dd className={cx("min-w-0 font-semibold", multi && "font-normal whitespace-pre-line")}>{v}</dd>
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

/** Sección desplegable: las administrativas empiezan cerradas y muestran un resumen en el título. */
function Seccion({ titulo, children, id, abierto = false, resumen }: { titulo: string; children: ReactNode; id?: string; abierto?: boolean; resumen?: ReactNode }) {
  return (
    <details id={id} open={abierto} className="group/sec scroll-mt-20 rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,105,133,0.05)] ring-1 ring-linea">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[17px] font-bold">{titulo}</span>
          {resumen && <span className="block truncate text-sm text-gris group-open/sec:hidden">{resumen}</span>}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="shrink-0 text-petroleo transition-transform duration-200 group-open/sec:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
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
