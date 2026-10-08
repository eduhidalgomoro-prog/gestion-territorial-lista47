import Link from "next/link";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/forms";
import { InstallButton } from "@/components/install-button";
import { Badge, Card, cx, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CONFIG_APARTE, CONFIG_KEYS, CONFIG_LABELS, CONFIG_TEXTOS, configToValue } from "@/lib/config";
import { snapshot } from "@/lib/db";
import { env } from "@/lib/env";
import { opcionesZona, zonaLabel } from "@/lib/labels";
import { puede, ROL_LABEL } from "@/lib/permisos";
import { ROLES, ZONAS, type Usuario } from "@/lib/schema";
import { ambitoDe, parseRegiones, regionLabel, zonasDe } from "@/lib/territorio";
import { titleCase } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { barrioAction, configAction, institucionAction, usuarioAction } from "../actions";
import { verComoAction } from "../ver-como-actions";

export const metadata = { title: "Configuración" };

const TABS = [
  { id: "usuarios", label: "Usuarios" },
  { id: "ver-como", label: "Ver como" },
  { id: "barrios", label: "Zonas y regiones" },
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
            <Badge color="petroleo">{ROL_LABEL[yo.rol]}</Badge> {zonasDe(yo.zona).map((z) => <Badge key={z} color="verde">{zonaLabel(z)}</Badge>)}
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
  const regiones = parseRegiones(s.config.regiones_interior).map((r) => r.nombre);

  return (
    <>
      <PageHeader title="Configuración" subtitle="Usuarios, zonas de Capital, regiones del interior y listas de la aplicación." />
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

      {tab === "ver-como" && <VerComo usuarios={s.usuarios} />}

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
                          {zonasDe(u.zona).map((z) => <Badge key={z} color="verde">{zonaLabel(z)}</Badge>)}
                          {u.estado !== "ACTIVO" && <Badge color="rojo">INACTIVO</Badge>}
                        </span>
                      </summary>
                      <div className="mt-4 border-t border-linea pt-4">
                        <UsuarioForm u={u} regiones={regiones} />
                      </div>
                    </details>
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <Card className="p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-bold">Agregar usuario</h2>
              <UsuarioForm regiones={regiones} />
            </Card>
            <Card className="mt-4 p-4 text-sm text-gris">
              <p className="mb-1 font-bold text-tinta">Roles</p>
              <p><b>Administrador:</b> todo, incluidos datos personales, costos y configuración.</p>
              <p className="mt-1"><b>Responsable de zona:</b> carga y edita actividades de sus zonas de Capital o regiones del interior (puede tener más de una), toma asistencia, cierra y ve sus estadísticas.</p>
              <p className="mt-1"><b>Operador:</b> solo las actividades que le asignan: inscriptos, asistencia y agregar personas.</p>
              <p className="mt-1"><b>Agenda (solo lectura):</b> ve todas las actividades, el calendario, el mapa y la cantidad de inscriptos. No ve datos de personas ni costos, y no puede modificar nada.</p>
              <p className="mt-1"><b>Responsable de ferias:</b> crea y organiza todas las ferias (inscriptas, puestos, croquis, avisos por WhatsApp y asistencia). No ve el resto de las actividades, ni participantes, costos o configuración.</p>
              <p className="mt-1"><b>Comunicación / Diseño:</b> ve todas las actividades (sin datos de personas ni costos) y gestiona los flyers: estado, link y envío por WhatsApp.</p>
            </Card>
          </section>
        </div>
      )}

      {tab === "barrios" && (
        <>
        <h2 className="mb-1 text-lg font-bold">Interior</h2>
        <div className="mb-8 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <section>
            {regiones.length === 0 ? (
              <Card className="p-4 text-gris">Todavía no hay regiones del interior. Cargalas en el cuadro de al lado.</Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {parseRegiones(s.config.regiones_interior).map((r) => {
                  const n = s.actividades.filter((a) => a.zona === r.nombre).length;
                  const resp = s.usuarios.filter((u) => zonasDe(u.zona).includes(r.nombre) && u.rol === "RESPONSABLE" && u.estado === "ACTIVO");
                  return (
                    <Card key={r.nombre} className="p-4">
                      <h3 className="font-bold">{regionLabel(r.nombre)}</h3>
                      <p className="mb-2 text-sm text-gris">
                        {n} {n === 1 ? "actividad" : "actividades"} · {resp.length ? `Responsable: ${resp.map((u) => `${u.nombre} ${u.apellido}`.trim()).join(", ")}` : "sin responsable asignado"}
                      </p>
                      <p className="text-[15px]">{r.localidades.join(", ") || <span className="text-gris">Sin localidades cargadas.</span>}</p>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
          <Card className="h-fit p-4 sm:p-5">
            <h3 className="mb-1 text-lg font-bold">Regiones y localidades</h3>
            <p className="mb-3 text-sm text-gris">
              Una región por línea y sus localidades separadas por comas. Después, en Usuarios, asigná a cada responsable su región: va a ver y cargar solo las actividades de esa región.
            </p>
            <ActionForm action={configAction}>
              <Field label="Regiones" name="regiones_interior">
                <Textarea
                  name="regiones_interior"
                  rows={8}
                  defaultValue={configToValue("regiones_interior", s.config.regiones_interior)}
                  placeholder={"Río Uruguay = Paso de los Libres, Santo Tomé, Alvear\nCentro = Mercedes, Curuzú Cuatiá\nRío Paraná = Goya, Esquina, Bella Vista"}
                />
              </Field>
              <SubmitButton>Guardar regiones</SubmitButton>
            </ActionForm>
          </Card>
        </div>
        <h2 className="mb-1 text-lg font-bold">Capital</h2>
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
        </>
      )}

      {tab === "listas" && (
        <Card className="p-4 sm:p-5">
          <ActionForm action={configAction}>
            <div className="grid gap-x-6 md:grid-cols-2">
              {CONFIG_KEYS.filter((k) => !CONFIG_APARTE.includes(k)).map((k) => (
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

function UsuarioForm({ u, regiones }: { u?: Usuario; regiones: string[] }) {
  // Si el usuario tiene una región que ya no está en Configuración, se sigue mostrando.
  const suyas = zonasDe(u?.zona ?? "");
  const opciones = opcionesZona([...regiones, ...suyas.filter((z) => ambitoDe(z) === "interior")], { general: false });
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
      <Field label="Rol" name="rol"><Select name="rol" defaultValue={u?.rol ?? "RESPONSABLE"} options={ROLES.map((r) => [r, ROL_LABEL[r]] as const)} /></Field>
      <Field
        label="Zonas o regiones"
        name="zona"
        hint="Obligatoria para responsables. Podés tildar más de una: por ejemplo, una zona de Capital y una región del interior."
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          {opciones.map(([valor, texto], i) => (
            <label key={valor} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-[15px] ring-1 ring-linea has-[:checked]:bg-petroleo-50 has-[:checked]:font-bold has-[:checked]:ring-petroleo">
              <input type="checkbox" name="zona" value={valor} id={i === 0 ? "zona" : undefined} defaultChecked={suyas.includes(valor)} className="size-5 accent-petroleo" />
              {texto}
            </label>
          ))}
        </div>
      </Field>
      {u && <Field label="Estado" name="estado"><Select name="estado" defaultValue={u.estado} options={[["ACTIVO", "Activo"], ["INACTIVO", "Inactivo (no puede ingresar)"]]} /></Field>}
      <SubmitButton size="md">{u ? "Guardar cambios" : "Agregar usuario"}</SubmitButton>
    </ActionForm>
  );
}

/**
 * «Ver la app como…»: el administrador elige a una persona (o un rol genérico si todavía no hay nadie con ese rol)
 * y recorre la app tal como la ve. Es solo para mirar: mientras está activo no se guarda nada.
 */
function VerComo({ usuarios }: { usuarios: Usuario[] }) {
  const activos = usuarios.filter((u) => u.estado === "ACTIVO" && u.rol !== "ADMINISTRADOR");
  const roles = ROLES.filter((r) => r !== "ADMINISTRADOR");
  const boton = "flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-2 text-left ring-1 ring-linea hover:ring-petroleo";
  return (
    <div className="max-w-3xl">
      <Notice className="mb-4">
        Elegí a una persona para ver la app exactamente como la ve ella: su menú, sus pantallas y sus actividades.
        Es <b>solo para mirar</b>: mientras estés en esa vista no se guarda ningún cambio. Arriba vas a ver una franja naranja para volver a administrador.
      </Notice>
      <div className="grid gap-4 sm:grid-cols-2">
        {roles.map((rol) => {
          const deEsteRol = activos.filter((u) => u.rol === rol).sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`));
          // Sin nadie con ese rol: una vista genérica (los responsables, una por zona de Capital).
          const genericos = deEsteRol.length ? [] : rol === "RESPONSABLE" ? ZONAS.map((z) => ({ valor: `r:${rol}:${z}`, texto: `Genérico · ${zonaLabel(z)}` })) : [{ valor: `r:${rol}:`, texto: "Genérico" }];
          return (
            <section key={rol} className="rounded-2xl bg-fondo p-3">
              <h3 className="mb-2 px-1 text-[15px] font-extrabold">{ROL_LABEL[rol]}</h3>
              <ul className="space-y-1.5">
                {deEsteRol.map((u) => (
                  <li key={u.id}>
                    <form action={verComoAction.bind(null, `u:${u.id}`)}>
                      <button type="submit" className={boton}>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-bold">{u.nombre} {u.apellido}</span>
                          {u.zona && <span className="block text-[13px] text-gris">{zonasDe(u.zona).map(zonaLabel).join(" · ")}</span>}
                        </span>
                        <span className="shrink-0 text-[13px] font-bold text-petroleo">Ver como →</span>
                      </button>
                    </form>
                  </li>
                ))}
                {genericos.map((g) => (
                  <li key={g.valor}>
                    <form action={verComoAction.bind(null, g.valor)}>
                      <button type="submit" className={boton}>
                        <span className="text-[15px] font-semibold text-gris">{g.texto}</span>
                        <span className="shrink-0 text-[13px] font-bold text-petroleo">Ver como →</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}