import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { CroquisEditor, CroquisVista } from "@/components/croquis";
import { CroquisAuto } from "@/components/croquis-auto";
import { ActionForm, Field, Input, SubmitButton } from "@/components/forms";
import { IconWhatsApp } from "@/components/icons";
import { Card, cx, Notice, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { whatsappA, whatsappCompartir } from "@/lib/compartir";
import { snapshot } from "@/lib/db";
import { env } from "@/lib/env";
import { SectoresEditor } from "@/components/sectores-editor";
import { buscarVecina, CAPACIDAD, describirPuesto, LLEVA_OPCIONES, SECTORES_INICIALES, sectoresDe, TIPO_PUESTO_HEX, TIPO_PUESTO_LABEL } from "@/lib/ferias";
import { puede } from "@/lib/permisos";
import type { Actividad } from "@/lib/schema";
import { ferianteActivas, puestosDe } from "@/lib/services/ferias";
import { formatDate, formatPhone } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { agregarFerianteAction, asignarAutomaticoAction, feriaConfigAction, puestosAction, quitarAsignacionesAction } from "../../../actions";
import { ListaFeriantes, type FilaFeriante } from "./feriantes";
import { BotonAccion } from "./boton-accion";

export const metadata = { title: "Feria" };

const TABS = [
  { id: "feriantes", label: "Feriantes" },
  { id: "puestos", label: "Puestos y croquis" },
  { id: "listado", label: "Listado" },
] as const;

const linkCroquis = (a: Actividad, n?: number) => `${env.appUrl()}/feria/${a.slug}${n ? `?p=${n}` : ""}`;

export default async function FeriaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const yo = await requireUser();
  const { id } = await params;
  const q = await searchParams;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a) notFound();
  if (!puede.verInscriptos(yo, a, s.asignaciones)) return <Notice tone="alerta">Tu rol no tiene acceso a las feriantes de esta actividad.</Notice>;
  const editable = puede.editarActividad(yo, a);
  const verTel = puede.verTelefono(yo);
  const volver = { href: `/actividades/${a.id}`, label: a.nombre };

  if (!a.es_feria) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader back={volver} kicker="Feria" title="Convertir en feria" subtitle="Inscripción con cupo, puestos numerados y croquis del lugar." />
        {editable ? (
          <Card className="p-4 sm:p-5">
            <ActionForm action={feriaConfigAction.bind(null, a.id)}>
              <Field label="Cupo de feriantes" name="cupo" hint="Cuando se llena, el formulario muestra «Cupo completo» y no acepta más inscripciones.">
                <Input name="cupo" type="number" min={1} max={500} defaultValue="60" inputMode="numeric" />
              </Field>
              <SubmitButton>Convertir en feria</SubmitButton>
            </ActionForm>
          </Card>
        ) : (
          <Notice>Esta actividad todavía no está organizada como feria.</Notice>
        )}
      </div>
    );
  }

  const tab = TABS.find((t) => t.id === sp(q, "tab"))?.id ?? "feriantes";
  const personas = new Map(s.participantes.map((p) => [p.id, p]));
  const todas = s.feriantes.filter((f) => f.actividad_id === a.id).sort((x, y) => x.creado.localeCompare(y.creado));
  const activas = ferianteActivas(s, a.id);
  const puestos = puestosDe(s, a.id);
  const tipoDe = new Map(puestos.map((p) => [p.numero, p.tipo]));
  const nombre = (pid: string) => {
    const p = personas.get(pid);
    return p ? `${p.nombre} ${p.apellido}`.trim() : "—";
  };
  const asignables = todas.map((f) => ({ ...f, nombre: nombre(f.participante_id) }));
  const fecha = a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "";
  const conPuesto = activas.filter((f) => f.puesto).length;
  const capacidadTotal = puestos.reduce((n, p) => n + CAPACIDAD[p.tipo], 0);

  const mensaje = (f: (typeof asignables)[number]) => {
    const compañeras = activas.filter((o) => o.puesto === f.puesto && o.id !== f.id).map((o) => nombre(o.participante_id));
    return [
      `Hola ${nombre(f.participante_id).split(" ")[0]} 👋 ¡Ya tenés tu lugar en *${a.nombre}*!`,
      [fecha && fecha.charAt(0).toUpperCase() + fecha.slice(1), a.hora_inicio && `${a.hora_inicio} h`, [a.lugar, a.direccion].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
      `Tu puesto es el *${describirPuesto(f.puesto, tipoDe.get(f.puesto), compañeras)}*.`,
      `Mirá dónde queda en el croquis: ${linkCroquis(a, f.puesto)}`,
    ].filter(Boolean).join("\n");
  };

  const filas: FilaFeriante[] = asignables.map((f, i) => {
    const p = personas.get(f.participante_id);
    const v = f.al_lado_de ? buscarVecina(f, asignables.filter((o) => o.estado === "INSCRIPTA")) : undefined;
    return {
      id: f.id, orden: i + 1, nombre: f.nombre, telefono: verTel && p?.telefono ? formatPhone(p.telefono) : "",
      emprendimiento: f.emprendimiento, rubro: f.rubro, lleva: f.lleva, comparte: f.comparte, al_lado_de: f.al_lado_de,
      vecina: v ? `${v.nombre} · ${v.emprendimiento}${v.puesto ? ` · N° ${v.puesto}` : ""}` : "",
      puesto: f.puesto, activa: f.estado === "INSCRIPTA",
      whatsapp: verTel && f.puesto && p?.telefono ? whatsappA(p.telefono, mensaje(f)) : "",
    };
  });

  // Listado del día, por número de puesto.
  const listado = puestos.map((p) => ({ ...p, quienes: asignables.filter((f) => f.estado === "INSCRIPTA" && f.puesto === p.numero) }));
  const croquisAuto = listado.map((p) => ({ numero: p.numero, tipo: p.tipo, nombres: p.quienes.map((f) => f.emprendimiento) }));
  const textoListado = [
    `*${a.nombre}*${fecha ? ` · ${fecha}` : ""}`,
    "Listado de puestos:",
    ...listado.filter((p) => p.quienes.length).map((p) => `N° ${p.numero} – ${p.quienes.map((f) => `${f.nombre} (${f.emprendimiento})`).join(" y ")}`),
    `\nCroquis: ${linkCroquis(a)}`,
  ].filter(Boolean).join("\n");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader back={volver} kicker="Feria" title={a.nombre} subtitle={[fecha, a.lugar].filter(Boolean).join(" · ")} />

      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cupo" value={a.cupo} />
        <Stat label="Inscriptas" value={activas.length} tone={activas.length >= a.cupo ? "alerta" : "normal"} hint={activas.length >= a.cupo ? "Cupo completo" : `Quedan ${a.cupo - activas.length}`} />
        <Stat label="Con puesto" value={`${conPuesto}/${activas.length}`} tone={conPuesto === activas.length && activas.length ? "verde" : "normal"} />
        <Stat label="Lugares en puestos" value={capacidadTotal} hint={`${puestos.length} puestos`} />
      </section>

      <Card className="mb-4 p-4">
        <p className="mb-1 text-sm font-bold text-gris uppercase">Formulario de inscripción</p>
        {a.link_inscripcion && a.inscripcion_abierta ? (
          <>
            <p className="font-mono text-sm break-all">{a.link_inscripcion}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton text={a.link_inscripcion} />
              <a href={whatsappCompartir(`Inscribite a *${a.nombre}*${fecha ? ` (${fecha})` : ""}. Cupo limitado: ${a.link_inscripcion}`)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#1f8f4e]/40 px-3 text-sm font-bold text-[#1f8f4e]">
                <IconWhatsApp size={18} /> Compartir
              </a>
            </div>
          </>
        ) : (
          <p className="text-[15px] text-gris">La inscripción está cerrada. Se abre desde la ficha de la actividad («Formulario de inscripción»).</p>
        )}
      </Card>

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-linea bg-white p-1" aria-label="Secciones de la feria">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/actividades/${a.id}/feria?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cx("min-h-11 flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-bold whitespace-nowrap", t.id === tab ? "bg-petroleo text-white" : "text-gris hover:bg-fondo")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "feriantes" && (
        <>
          {editable && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {puestos.length ? (
                <>
                  <BotonAccion action={asignarAutomaticoAction.bind(null, a.id)} variante="primario">Asignar puestos a las que faltan</BotonAccion>
                  {conPuesto > 0 && <BotonAccion action={quitarAsignacionesAction.bind(null, a.id)} variante="fantasma" confirmar="¿Quitar el puesto a todas las feriantes?">Quitar todas las asignaciones</BotonAccion>}
                </>
              ) : (
                <Notice className="w-full">
                  Para asignar lugares, primero armá los puestos en <Link href={`/actividades/${a.id}/feria?tab=puestos`} className="font-bold underline">Puestos y croquis</Link>.
                </Notice>
              )}
            </div>
          )}
          {editable && puestos.length > 0 && (
            <p className="mb-3 text-sm text-gris">
              La asignación automática respeta el orden de inscripción: quien trae gazebo va a un puesto propio, quien puede compartir a uno compartido (si pidió estar con alguien que también comparte, van juntas) y el resto a uno individual. Después podés cambiar cualquiera a mano.
            </p>
          )}
          {filas.length === 0 ? (
            <Notice>Todavía no hay feriantes inscriptas. Compartí el link del formulario.</Notice>
          ) : (
            <ListaFeriantes filas={filas} puestos={puestos.map((p) => ({ numero: p.numero, tipo: p.tipo }))} editable={editable} />
          )}
          {editable && (
            <details className="mt-5 rounded-2xl border border-linea bg-white p-4">
              <summary className="cursor-pointer font-bold text-petroleo">+ Agregar una feriante a mano</summary>
              <ActionForm action={agregarFerianteAction.bind(null, a.id)} resetOnSuccess className="mt-3">
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <Field label="Nombre" name="nombre"><Input name="nombre" /></Field>
                  <Field label="Apellido" name="apellido"><Input name="apellido" /></Field>
                  <Field label="Teléfono (WhatsApp)" name="telefono"><Input name="telefono" type="tel" inputMode="tel" /></Field>
                  <Field label="DNI" name="dni" optional><Input name="dni" inputMode="numeric" /></Field>
                  <Field label="Emprendimiento" name="emprendimiento"><Input name="emprendimiento" /></Field>
                  <Field label="Rubro" name="rubro"><Input name="rubro" /></Field>
                </div>
                <fieldset className="mb-4">
                  <legend className="mb-1.5 text-[15px] font-bold">Puede llevar</legend>
                  <div className="flex flex-wrap gap-3">
                    {LLEVA_OPCIONES.map((o) => (
                      <label key={o} className="inline-flex items-center gap-2 text-[15px]">
                        <input type="checkbox" name="lleva" value={o} className="size-5 accent-[#3f742c]" /> {o}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="mb-4">
                  <legend className="mb-1.5 text-[15px] font-bold">¿Puede compartir stand?</legend>
                  <div className="flex gap-4">
                    {[["SI", "Sí"], ["NO", "No"]].map(([v, l]) => (
                      <label key={v} className="inline-flex items-center gap-2 text-[15px]">
                        <input type="radio" name="comparte" value={v} className="size-5 accent-[#3f742c]" /> {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Quiere estar al lado de" name="al_lado_de" optional><Input name="al_lado_de" /></Field>
                <SubmitButton>Agregar feriante</SubmitButton>
              </ActionForm>
            </details>
          )}
        </>
      )}

      {tab === "puestos" && (
        <div className="space-y-4">
          {editable && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4 sm:p-5">
                <h2 className="mb-1 text-lg font-bold">Sectores y gazebos</h2>
                <p className="mb-3 text-sm text-gris">Cada sector es una fila del croquis; los números van de corrido. Si cambiás algo, las asignaciones que siguen siendo válidas se mantienen.</p>
                <ActionForm action={puestosAction.bind(null, a.id)}>
                  <SectoresEditor key={puestos.map((p) => `${p.numero}${p.tipo}${p.sector}`).join()} inicial={puestos.length ? sectoresDe(puestos) : SECTORES_INICIALES} />
                  <SubmitButton>{puestos.length ? "Guardar sectores" : "Armar puestos"}</SubmitButton>
                </ActionForm>
              </Card>
              <Card className="p-4 sm:p-5">
                <h2 className="mb-1 text-lg font-bold">Cupo</h2>
                <p className="mb-3 text-sm text-gris">Con los puestos de arriba entran {capacidadTotal} feriantes.</p>
                <ActionForm action={feriaConfigAction.bind(null, a.id)}>
                  <Field label="Cupo de feriantes" name="cupo"><Input name="cupo" type="number" min={1} max={500} inputMode="numeric" defaultValue={String(a.cupo)} /></Field>
                  <SubmitButton variant="secundario">Guardar cupo</SubmitButton>
                </ActionForm>
              </Card>
            </div>
          )}
          {puestos.length > 0 && (
            <section>
              <h2 className="mb-1 text-lg font-bold">Croquis</h2>
              <p className="mb-2 text-sm text-gris">Lo arma la app con los puestos y las asignaciones: un sector por fila, cada gazebo con su número y los emprendimientos. Se actualiza solo.</p>
              <CroquisAuto puestos={croquisAuto} />
            </section>
          )}
          {puestos.length > 0 && (editable || a.croquis) && (
            <details className="rounded-2xl border border-linea bg-white p-4" open={!!a.croquis}>
              <summary className="cursor-pointer font-bold text-petroleo">Opcional: foto o plano del lugar con los números</summary>
              <div className="mt-3">
                {editable ? (
                  <CroquisEditor actividadId={a.id} url={a.croquis} puestos={puestos.map((p) => ({ numero: p.numero, tipo: p.tipo, x: p.x, y: p.y }))} />
                ) : (
                  <CroquisVista url={a.croquis} puestos={puestos} />
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {tab === "listado" && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 print:hidden">
            <CopyButton text={textoListado} label="Copiar listado para WhatsApp" />
            <a href={whatsappCompartir(textoListado)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#1f8f4e]/40 px-3 text-sm font-bold text-[#1f8f4e]">
              <IconWhatsApp size={18} /> Enviar listado
            </a>
            {a.slug && (
              <Link href={`/feria/${a.slug}`} target="_blank" className="inline-flex min-h-10 items-center rounded-xl border border-linea px-3 text-sm font-bold text-petroleo">
                Ver croquis público
              </Link>
            )}
          </div>
          <p className="mb-3 text-sm text-gris print:hidden">
            Para avisarle a cada una su puesto por separado, usá «Avisar su puesto» en la pestaña Feriantes. El listado y el croquis público muestran nombre y emprendimiento (sin teléfonos).
          </p>
          {puestos.length > 0 && (
            <div className="mb-4">
              <CroquisAuto puestos={croquisAuto} />
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-linea bg-white">
            <table className="w-full text-left text-[15px]">
              <thead className="bg-fondo text-xs font-bold text-gris uppercase">
                <tr>
                  <th className="px-3 py-2">N°</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Feriante</th>
                  <th className="hidden px-3 py-2 sm:table-cell">Rubro</th>
                </tr>
              </thead>
              <tbody>
                {listado.map((p) => (
                  <tr key={p.numero} className="border-t border-linea align-top">
                    <td className="px-3 py-2 font-extrabold" style={{ color: TIPO_PUESTO_HEX[p.tipo] }}>{p.numero}</td>
                    <td className="px-3 py-2 text-sm text-gris">{TIPO_PUESTO_LABEL[p.tipo]}</td>
                    <td className="px-3 py-2">
                      {p.quienes.length ? p.quienes.map((f) => <span key={f.id} className="block"><b>{f.nombre}</b> · {f.emprendimiento}</span>) : <span className="text-gris">Libre</span>}
                    </td>
                    <td className="hidden px-3 py-2 text-sm text-gris sm:table-cell">{p.quienes.map((f) => f.rubro).join(" / ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {activas.some((f) => !f.puesto) && (
            <Notice tone="alerta" className="mt-3">
              Sin puesto: {asignables.filter((f) => f.estado === "INSCRIPTA" && !f.puesto).map((f) => f.nombre).join(", ")}.
            </Notice>
          )}
        </>
      )}
    </div>
  );
}
