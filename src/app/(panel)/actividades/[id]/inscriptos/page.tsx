import Link from "next/link";
import { notFound } from "next/navigation";
import { Buscador, FiltrosForm } from "@/components/filtros";
import { ActionForm, Input, SubmitButton, Textarea } from "@/components/forms";
import { IconWhatsApp } from "@/components/icons";
import { Badge, btn, cx, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { completarMensaje, whatsappA } from "@/lib/compartir";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { formatDate, formatDni, formatPhone, fullName, maskDni, maskPhone, normalizeText, titleCase } from "@/lib/util";
import { qs, sp, type SP } from "@/lib/view";
import { bajaInscripcionAction, confirmacionAction, linkGrupoAction, mensajesAction } from "../../../actions";

export const metadata = { title: "Inscriptos" };

const FILTROS = [
  { id: "", label: "Todos" },
  { id: "sin", label: "Sin respuesta" },
  { id: "si", label: "Confirmaron" },
  { id: "no", label: "No van" },
] as const;

export default async function Inscriptos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const yo = await requireUser();
  const { id } = await params;
  const q = await searchParams;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verInscriptos(yo, a, s.asignaciones)) notFound();
  const personas = new Map(s.participantes.map((p) => [p.id, p]));
  const asis = new Map(s.asistencias.filter((x) => x.actividad_id === id).map((x) => [x.participante_id, x.estado]));
  const busq = normalizeText(sp(q, "q"));
  const filtro = sp(q, "c");
  const todos = s.inscripciones.filter((i) => i.actividad_id === id && i.estado === "INSCRIPTO");
  const cuenta = {
    si: todos.filter((i) => i.confirmacion === "CONFIRMÓ").length,
    no: todos.filter((i) => i.confirmacion === "NO VA").length,
    sin: todos.filter((i) => !i.confirmacion).length,
  };
  const lista = todos
    .filter((i) => !filtro || (filtro === "si" ? i.confirmacion === "CONFIRMÓ" : filtro === "no" ? i.confirmacion === "NO VA" : !i.confirmacion))
    .map((i) => ({ i, p: personas.get(i.participante_id) }))
    .filter(({ p }) => !busq || (p && normalizeText(`${p.nombre} ${p.apellido} ${p.dni} ${p.telefono}`).includes(busq)))
    .sort((x, y) => fullName(x.p).localeCompare(fullName(y.p)));
  const dni = puede.verDniCompleto(yo);
  const tel = puede.verTelefono(yo);
  const editar = puede.editarActividad(yo, a);
  // Contactar por WhatsApp: quienes toman asistencia (operador asignado, responsable de la zona, administración).
  const contactar = puede.tomarAsistencia(yo, a, s.asignaciones) && a.estado !== "REALIZADA" && a.estado !== "CANCELADA";
  // Mensaje propio de esta actividad o, si no tiene, el de Configuración.
  const plantillaConfirmacion = a.mensaje_confirmacion || s.config.mensaje_confirmacion;
  const plantillaGrupo = a.mensaje_grupo || s.config.mensaje_grupo;
  const personalizado = !!(a.mensaje_confirmacion || a.mensaje_grupo);
  const ejemplo = todos.map((i) => personas.get(i.participante_id)).find(Boolean);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/actividades/${id}`, label: a.nombre }}
        title="Inscriptos"
        subtitle={`${todos.length} ${todos.length === 1 ? "persona" : "personas"}`}
        actions={
          <>
            {puede.tomarAsistencia(yo, a, s.asignaciones) && <Link href={`/actividades/${id}/asistencia`} className={btn("primario")}>Tomar asistencia</Link>}
            {puede.importar(yo, a) && <Link href={`/actividades/${id}/importar`} className={btn("secundario")}>Importar Google Forms</Link>}
          </>
        }
      />

      {contactar && (
        <section className="mb-4 rounded-2xl border border-linea bg-white p-4">
          <h2 className="font-bold">Confirmación y grupo de WhatsApp</h2>
          <ol className="mt-1 mb-3 list-decimal space-y-0.5 pl-5 text-sm text-gris">
            <li>Tocá <b>«Pedir confirmación»</b> en cada persona: se abre WhatsApp con el mensaje listo.</li>
            <li>Cuando responda, marcá <b>✓ Confirmó</b> o <b>✗ No va</b>.</li>
            <li>Pegá acá el link de invitación del grupo y usá <b>«Invitar al grupo»</b> con quienes confirmaron.</li>
          </ol>
          <details className="mb-3 rounded-xl bg-fondo p-3">
            <summary className="cursor-pointer text-sm font-bold text-petroleo">
              ✏️ Cambiar los mensajes {personalizado ? "(esta actividad tiene mensajes propios)" : ""}
            </summary>
            <p className="mt-2 text-xs text-gris">
              Se aplican solo a esta actividad. Podés usar {"{nombre}"}, {"{actividad}"}, {"{cuando}"}, {"{lugar}"} y {"{link_grupo}"}: la app los completa para cada persona. *texto* sale en negrita en WhatsApp.
              {puede.configurar(yo) && (
                <> El mensaje por defecto de todas las actividades se cambia en <Link href="/configuracion?tab=listas" className="font-bold text-petroleo underline">Configuración → Listas</Link>.</>
              )}
            </p>
            <ActionForm action={mensajesAction.bind(null, id)} className="mt-3">
              <label className="mb-1 block text-sm font-bold" htmlFor="mensaje_confirmacion">Mensaje para pedir confirmación</label>
              <Textarea name="mensaje_confirmacion" rows={4} defaultValue={plantillaConfirmacion} />
              {ejemplo && (
                <p className="mt-1 mb-3 rounded-lg bg-white p-2 text-xs whitespace-pre-line text-gris">
                  <b>Así le llega a {ejemplo.nombre}:</b>
                  {"\n"}
                  {completarMensaje(plantillaConfirmacion, ejemplo.nombre, a)}
                </p>
              )}
              <label className="mb-1 block text-sm font-bold" htmlFor="mensaje_grupo">Mensaje de invitación al grupo</label>
              <Textarea name="mensaje_grupo" rows={3} defaultValue={plantillaGrupo} />
              <div className="mt-3 flex flex-wrap gap-2">
                <SubmitButton size="sm" pendingText="Guardando…">Guardar mensajes</SubmitButton>
                {personalizado && (
                  <SubmitButton size="sm" variant="secundario" name="restaurar" value="1" pendingText="…">
                    Volver al mensaje por defecto
                  </SubmitButton>
                )}
              </div>
            </ActionForm>
          </details>
          <ActionForm action={linkGrupoAction.bind(null, id)} className="flex flex-col gap-2 sm:flex-row">
            <Input name="link_grupo" type="url" defaultValue={a.link_grupo} placeholder="https://chat.whatsapp.com/…" aria-label="Link de invitación al grupo de WhatsApp" className="h-11" />
            <SubmitButton size="md" pendingText="…">{a.link_grupo ? "Actualizar link" : "Guardar link"}</SubmitButton>
          </ActionForm>
        </section>
      )}

      {/* Contador por respuesta (también funciona como filtro) */}
      <nav className="mb-3 flex flex-wrap gap-2" aria-label="Filtrar por respuesta">
        {FILTROS.map((f) => {
          const n = f.id === "" ? todos.length : cuenta[f.id];
          return (
            <Link
              key={f.id}
              href={`/actividades/${id}/inscriptos${qs({ c: f.id, q: sp(q, "q") })}`}
              aria-current={filtro === f.id ? "page" : undefined}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold",
                filtro === f.id ? "border-petroleo bg-petroleo text-white" : "border-linea bg-white hover:border-petroleo",
              )}
            >
              {f.label} <span className="tabular-nums">{n}</span>
            </Link>
          );
        })}
      </nav>

      <FiltrosForm action={`/actividades/${id}/inscriptos`} className="mb-4">
        {filtro && <input type="hidden" name="c" value={filtro} />}
        <Buscador value={sp(q, "q")} placeholder="Buscar por nombre, apellido, DNI o teléfono" />
      </FiltrosForm>

      {lista.length === 0 ? (
        <Empty>{busq || filtro ? "Nadie coincide con la búsqueda." : "Todavía no hay inscriptos."}</Empty>
      ) : (
        <ul className="space-y-2">
          {lista.map(({ i, p }) => {
            const estado = asis.get(i.participante_id);
            const waConfirmar = contactar && p ? whatsappA(p.telefono, completarMensaje(plantillaConfirmacion, p.nombre, a)) : "";
            const waGrupo =
              contactar && p && a.link_grupo && i.confirmacion === "CONFIRMÓ" ? whatsappA(p.telefono, completarMensaje(plantillaGrupo, p.nombre, a)) : "";
            return (
              <li key={i.id} className="rounded-2xl border border-linea bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {puede.verParticipantes(yo) ? (
                      <Link href={`/participantes/${i.participante_id}`} className="font-bold hover:text-petroleo hover:underline">{fullName(p)}</Link>
                    ) : (
                      <p className="font-bold">{fullName(p)}</p>
                    )}
                    <p className="text-sm text-gris">
                      {p?.dni ? `DNI ${dni ? formatDni(p.dni) : maskDni(p.dni)}` : "Sin DNI"}
                      {p?.telefono && ` · Tel. ${tel ? formatPhone(p.telefono) : maskPhone(p.telefono)}`}
                      {p?.barrio && ` · ${titleCase(p.barrio)}`}
                    </p>
                    <p className="text-xs text-gris">
                      Inscripción {formatDate(i.fecha)} · {i.origen.toLowerCase()}
                    </p>
                    {i.respuestas && <p className="mt-1 text-sm whitespace-pre-line">{i.respuestas}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {i.confirmacion === "CONFIRMÓ" && <Badge color="verde">✓ CONFIRMÓ</Badge>}
                    {i.confirmacion === "NO VA" && <Badge color="naranja">✗ NO VA</Badge>}
                    {estado === "PRESENTE" && <Badge color="petroleo">PRESENTE</Badge>}
                    {estado === "AUSENTE" && <Badge color="gris">AUSENTE</Badge>}
                  </div>
                </div>

                {contactar && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-linea pt-3">
                    {waConfirmar ? (
                      <a href={waConfirmar} target="_blank" rel="noopener noreferrer" className={cx(btn("secundario", "sm"), "border-[#1f8f4e]/40 text-[#1f8f4e]")}>
                        <IconWhatsApp size={18} /> Pedir confirmación
                      </a>
                    ) : (
                      <span className="text-xs text-gris">Sin teléfono válido para WhatsApp</span>
                    )}
                    {(["CONFIRMÓ", "NO VA"] as const).map((v) => (
                      <ActionForm key={v} action={confirmacionAction.bind(null, i.id, i.confirmacion === v ? "" : v)}>
                        <SubmitButton size="sm" variant={i.confirmacion === v ? (v === "CONFIRMÓ" ? "primario" : "peligro") : "secundario"} pendingText="…">
                          {v === "CONFIRMÓ" ? "✓ Confirmó" : "✗ No va"}
                        </SubmitButton>
                      </ActionForm>
                    ))}
                    {waGrupo && (
                      <a href={waGrupo} target="_blank" rel="noopener noreferrer" className={btn("primario", "sm")}>
                        <IconWhatsApp size={18} /> Invitar al grupo
                      </a>
                    )}
                  </div>
                )}

                {editar && a.estado !== "REALIZADA" && (
                  <details className="mt-2">
                    <summary className="cursor-pointer list-none text-sm text-gris hover:underline">Dar de baja</summary>
                    <div className="mt-2 rounded-xl border border-linea bg-fondo p-3">
                      <p className="mb-2 text-sm">¿Quitar a {p?.nombre} de esta actividad?</p>
                      <ActionForm action={bajaInscripcionAction.bind(null, i.id)}>
                        <SubmitButton size="sm" variant="peligro" pendingText="…">Sí, dar de baja</SubmitButton>
                      </ActionForm>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
