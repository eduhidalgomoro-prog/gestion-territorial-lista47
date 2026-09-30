import Link from "next/link";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/forms";
import { InstallButton } from "@/components/install-button";
import { Badge, Card, cx, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CONFIG_KEYS, CONFIG_LABELS, CONFIG_TEXTOS, configToValue } from "@/lib/config";
import { snapshot } from "@/lib/db";
import { env } from "@/lib/env";
import { zonaLabel } from "@/lib/labels";
import { puede, ROL_LABEL } from "@/lib/permisos";
import { ROLES, ZONAS, type Usuario } from "@/lib/schema";
import { titleCase } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { barrioAction, configAction, institucionAction, usuarioAction } from "../actions";

export const metadata = { title: "Configuración" };

const TABS = [
  { id: "usuarios", label: "Usuarios" },
  { id: "barrios", label: "Zonas y barrios" },
  { id: "listas", label: "Listas" },
  { id: "instituciones", label: "Instituciones" },
] as const;

export default async function Configuracion({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  if (!puede.configurar(yo)) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Mi cuenta" />
        <Card className="p-5">
          <p className="text-lg font-bold">{yo.nombre}</p>
          <p className="text-gris">{yo.email}</p>
          <p className="mt-2">
            <Badge color="petroleo">{ROL_LABEL[yo.rol]}</Badge> {yo.zona && <Badge color="verde">{zonaLabel(yo.zona)}</Badge>}
          </p>
          <div className="mt-5 space-y-2">
            <InstallButton className="w-full" />
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="min-h-12 w-full rounded-xl border border-linea font-semibold text-gris hover:bg-fondo">Cerrar sesión</button>
            </form>
          </div>
        </Card>
      </div>
    );
  }
  const q = await searchParams;
  const tab = TABS.find((t) => t.id === sp(q, "tab"))?.id ?? "usuarios";
  const s = await snapshot();

  return (
    <>
      <PageHeader title="Configuración" subtitle="Usuarios, zonas, barrios y listas de la aplicación." />
      {env.dataBackend() !== "sheets" && (
        <Notice tone="alerta" className="mb-4">
          Modo de prueba: los datos se guardan en un archivo local, no en Google Sheets.
        </Notice>
      )}
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-linea bg-white p-1" aria-label="Secciones">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/configuracion?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cx("min-h-11 flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-bold whitespace-nowrap", t.id === tab ? "bg-petroleo text-white" : "text-gris hover:bg-fondo")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "usuarios" && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section>
            <h2 className="mb-2 text-lg font-bold">Usuarios ({s.usuarios.length})</h2>
            <p className="mb-3 text-sm text-gris">
              Cada persona ingresa con su cuenta de Google. Los administradores iniciales ({env.adminEmails().join(", ") || "ninguno"}) entran siempre.
            </p>
            <ul className="space-y-2">
              {s.usuarios
                .slice()
                .sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre))
                .map((u) => (
                  <li key={u.id} className="rounded-2xl border border-linea bg-white p-4">
                    <details>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-bold">{u.nombre} {u.apellido}</span>
                          <span className="block truncate text-sm text-gris">{u.email}</span>
                        </span>
                        <span className="flex flex-wrap gap-1">
                          <Badge color="petroleo">{u.rol}</Badge>
                          {u.zona && <Badge color="verde">{u.zona}</Badge>}
                          {u.estado !== "ACTIVO" && <Badge color="rojo">INACTIVO</Badge>}
                        </span>
                      </summary>
                      <div className="mt-4 border-t border-linea pt-4">
                        <UsuarioForm u={u} />
                      </div>
                    </details>
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <Card className="p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-bold">Agregar usuario</h2>
              <UsuarioForm />
            </Card>
            <Card className="mt-4 p-4 text-sm text-gris">
              <p className="mb-1 font-bold text-tinta">Roles</p>
              <p><b>Administrador:</b> todo, incluidos datos personales, costos y configuración.</p>
              <p className="mt-1"><b>Responsable de zona:</b> carga y edita actividades de su zona, toma asistencia, cierra y ve estadísticas de su zona.</p>
              <p className="mt-1"><b>Operador:</b> solo las actividades que le asignan: inscriptos, asistencia y agregar personas.</p>
              <p className="mt-1"><b>Agenda (solo lectura):</b> ve todas las actividades, el calendario, el mapa y la cantidad de inscriptos. No ve datos de personas ni costos, y no puede modificar nada.</p>
              <p className="mt-1"><b>Comunicación / Diseño:</b> ve todas las actividades (sin datos de personas ni costos) y gestiona los flyers: estado, link y envío por WhatsApp.</p>
            </Card>
          </section>
        </div>
      )}

      {tab === "barrios" && (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <section className="grid gap-4 md:grid-cols-3">
            {ZONAS.map((z) => {
              const bs = s.barrios.filter((b) => b.zona === z).sort((a, b) => a.barrio.localeCompare(b.barrio));
              return (
                <Card key={z} className="p-4">
                  <h2 className="mb-2 font-bold">{zonaLabel(z)} <span className="text-sm text-gris">({bs.filter((b) => b.activo).length})</span></h2>
                  {bs.length === 0 ? (
                    <p className="text-sm text-gris">Sin barrios cargados.</p>
                  ) : (
                    <ul className="space-y-1 text-[15px]">
                      {bs.map((b) => (
                        <li key={b.barrio} className={cx("flex items-center justify-between gap-2", !b.activo && "text-gris line-through")}>
                          {titleCase(b.barrio)}
                          <ActionForm action={barrioAction}>
                            <input type="hidden" name="barrio" value={b.barrio} />
                            <input type="hidden" name="zona" value={b.zona} />
                            <input type="hidden" name="activo" value={b.activo ? "NO" : "SI"} />
                            <SubmitButton size="sm" variant="fantasma" pendingText="…">{b.activo ? "Ocultar" : "Activar"}</SubmitButton>
                          </ActionForm>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </section>
          <Card className="h-fit p-4 sm:p-5">
            <h2 className="mb-1 text-lg font-bold">Agregar o mover barrio</h2>
            <p className="mb-3 text-sm text-gris">Si el barrio ya existe, se cambia de zona. Los nombres se guardan en mayúsculas para evitar duplicados.</p>
            <ActionForm action={barrioAction} resetOnSuccess>
              <Field label="Barrio" name="barrio"><Input name="barrio" placeholder="Ej: SAN BENITO" /></Field>
              <Field label="Zona" name="zona"><Select name="zona" placeholder="Elegí…" options={ZONAS.map((z) => [z, zonaLabel(z)] as const)} /></Field>
              <input type="hidden" name="activo" value="SI" />
              <SubmitButton>Guardar barrio</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}

      {tab === "listas" && (
        <Card className="p-4 sm:p-5">
          <ActionForm action={configAction}>
            <div className="grid gap-x-6 md:grid-cols-2">
              {CONFIG_KEYS.map((k) => (
                <div key={k} className={CONFIG_TEXTOS.includes(k) ? "md:col-span-2" : ""}>
                <Field label={CONFIG_LABELS[k].titulo} name={k} hint={CONFIG_LABELS[k].descripcion}>
                  {k === "objetivo_mensual" ? (
                    <Input name={k} type="number" min={0} max={50} defaultValue={String(s.config[k])} />
                  ) : (
                    <Textarea name={k} rows={CONFIG_TEXTOS.includes(k) ? 4 : 6} defaultValue={configToValue(k, s.config[k])} />
                  )}
                </Field>
                </div>
              ))}
            </div>
            <SubmitButton>Guardar listas</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {tab === "instituciones" && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section>
            <h2 className="mb-2 text-lg font-bold">Instituciones ({s.instituciones.length})</h2>
            {s.instituciones.length === 0 ? (
              <p className="text-gris">Todavía no hay instituciones. También se crean al cargar una actividad que articula con una institución nueva.</p>
            ) : (
              <ul className="space-y-2">
                {s.instituciones.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((i) => {
                  const n = s.actividades.filter((a) => a.institucion_id === i.id).length;
                  return (
                    <li key={i.id} className="rounded-2xl border border-linea bg-white p-4">
                      <details>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                          <span>
                            <span className="block font-bold">{i.nombre}</span>
                            <span className="text-sm text-gris">{i.tipo || "Sin tipo"} · {n} {n === 1 ? "actividad" : "actividades"}</span>
                          </span>
                          <span className="text-sm font-bold text-petroleo">Editar</span>
                        </summary>
                        <ActionForm action={institucionAction.bind(null, i.id)} className="mt-3 border-t border-linea pt-3">
                          <Field label="Nombre" name="nombre"><Input name="nombre" defaultValue={i.nombre} /></Field>
                          <Field label="Tipo" name="tipo" optional><Input name="tipo" defaultValue={i.tipo} /></Field>
                          <Field label="Observaciones" name="observaciones" optional><Textarea name="observaciones" defaultValue={i.observaciones} /></Field>
                          <SubmitButton size="md">Guardar</SubmitButton>
                        </ActionForm>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <Card className="h-fit p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-bold">Agregar institución</h2>
            <ActionForm action={institucionAction.bind(null, null)} resetOnSuccess>
              <Field label="Nombre" name="nombre"><Input name="nombre" /></Field>
              <Field label="Tipo" name="tipo" optional><Input name="tipo" placeholder="Club, escuela, iglesia, ONG…" /></Field>
              <Field label="Observaciones" name="observaciones" optional><Textarea name="observaciones" /></Field>
              <SubmitButton>Agregar</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}

function UsuarioForm({ u }: { u?: Usuario }) {
  return (
    <ActionForm action={usuarioAction.bind(null, u?.id ?? null)} resetOnSuccess={!u}>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Nombre" name="nombre"><Input name="nombre" defaultValue={u?.nombre} /></Field>
        <Field label="Apellido" name="apellido" optional><Input name="apellido" defaultValue={u?.apellido} /></Field>
      </div>
      <Field label="Email (cuenta de Google)" name="email"><Input name="email" type="email" inputMode="email" defaultValue={u?.email} autoComplete="off" /></Field>
      <Field label="Teléfono (WhatsApp)" name="telefono" optional hint="Para que el equipo de diseño le envíe los flyers por WhatsApp.">
        <Input name="telefono" type="tel" inputMode="tel" defaultValue={u?.telefono} placeholder="Ej: 379 4123456" autoComplete="off" />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Rol" name="rol"><Select name="rol" defaultValue={u?.rol ?? "RESPONSABLE"} options={ROLES.map((r) => [r, ROL_LABEL[r]] as const)} /></Field>
        <Field label="Zona" name="zona" hint="Obligatoria para responsables."><Select name="zona" defaultValue={u?.zona ?? ""} placeholder="Sin zona" options={ZONAS.map((z) => [z, zonaLabel(z)] as const)} /></Field>
      </div>
      {u && <Field label="Estado" name="estado"><Select name="estado" defaultValue={u.estado} options={[["ACTIVO", "Activo"], ["INACTIVO", "Inactivo (no puede ingresar)"]]} /></Field>}
      <SubmitButton size="md">{u ? "Guardar cambios" : "Agregar usuario"}</SubmitButton>
    </ActionForm>
  );
}
