import "server-only";
import { configToValue, CONFIG_KEYS, CONFIG_LABELS, CONFIG_TEXTOS, DEFAULT_CONFIG, type AppConfig } from "../config";
import { insert, readFresh, setConfigValue, snapshot, update, upsertBarrio, NotFoundError } from "../db";
import { UserError } from "../errors";
import { withLock } from "../lock";
import { ROLES, ZONAS, type Rol, type Zona } from "../schema";
import { parseRegiones, unirZonas, validarRegiones, zonasDe, zonaValida, type Region } from "../territorio";
import { cleanString, normalizeBarrio, normalizePhone, titleCase } from "../util";

export interface UsuarioInput {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  rol: string;
  zona: string;
  activo: boolean;
}

function validarUsuario(u: UsuarioInput, regiones: Region[]) {
  const f: Record<string, string> = {};
  const email = cleanString(u.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) f.email = "Email inválido (tiene que ser la cuenta de Google con la que va a ingresar).";
  const nombre = titleCase(cleanString(u.nombre, 80));
  if (!nombre) f.nombre = "Falta el nombre.";
  const rol = (ROLES as readonly string[]).includes(u.rol) ? (u.rol as Rol) : null;
  if (!rol) f.rol = "Elegí el rol.";
  // Puede tener varias zonas (por ejemplo, una de Capital y una región del interior).
  const zona = unirZonas(zonasDe(u.zona).filter((z) => zonaValida(z, regiones, false)));
  if (rol === "RESPONSABLE" && !zona) f.zona = "Un responsable necesita al menos una zona o región.";
  if (Object.keys(f).length) throw new UserError("Revisá los datos del usuario.", f);
  const telefono = normalizePhone(cleanString(u.telefono, 40));
  if (u.telefono && telefono.length < 10) f.telefono = "Teléfono inválido (con característica, ej. 379 4123456).";
  if (Object.keys(f).length) throw new UserError("Revisá los datos del usuario.", f);
  return { nombre, apellido: titleCase(cleanString(u.apellido, 80)), email, telefono, rol: rol!, zona, estado: u.activo ? ("ACTIVO" as const) : ("INACTIVO" as const) };
}

async function regionesActuales() {
  return parseRegiones((await snapshot()).config.regiones_interior);
}

export async function crearUsuario(input: UsuarioInput, user: string) {
  const data = validarUsuario(input, await regionesActuales());
  return withLock("usuarios", async () => {
    const existentes = await readFresh("usuarios");
    if (existentes.some((u) => u.email.toLowerCase() === data.email)) throw new UserError("Ya hay un usuario con ese email.", { email: "Ya existe." });
    return insert("usuarios", data, user);
  });
}

export async function editarUsuario(id: string, input: UsuarioInput, user: string) {
  const data = validarUsuario(input, await regionesActuales());
  const existentes = await readFresh("usuarios");
  if (!existentes.some((u) => u.id === id)) throw new NotFoundError("El usuario");
  if (existentes.some((u) => u.id !== id && u.email.toLowerCase() === data.email)) throw new UserError("Ya hay otro usuario con ese email.", { email: "Ya existe." });
  return update("usuarios", id, data, user);
}

export async function guardarBarrio(barrio: string, zona: string, activo: boolean, user: string) {
  const b = normalizeBarrio(cleanString(barrio, 80));
  if (!b) throw new UserError("Escribí el nombre del barrio.", { barrio: "Falta el barrio." });
  if (!(ZONAS as readonly string[]).includes(zona)) throw new UserError("Elegí la zona.", { zona: "Elegí la zona." });
  await upsertBarrio({ barrio: b, zona: zona as Zona, activo }, user);
}

export async function guardarInstitucion(input: { id?: string; nombre: string; tipo: string; observaciones: string }, user: string) {
  const nombre = cleanString(input.nombre, 150);
  if (!nombre) throw new UserError("Falta el nombre.", { nombre: "Falta el nombre." });
  const data = { nombre, tipo: cleanString(input.tipo, 80), observaciones: cleanString(input.observaciones, 500) };
  if (input.id) return update("instituciones", input.id, data, user);
  const s = await snapshot();
  if (s.instituciones.some((i) => i.nombre.toLowerCase() === nombre.toLowerCase())) throw new UserError("Esa institución ya existe.", { nombre: "Ya existe." });
  return insert("instituciones", data, user);
}

export async function guardarConfig(values: Record<string, string>, user: string) {
  for (const k of CONFIG_KEYS) {
    if (!(k in values)) continue;
    let v: AppConfig[typeof k];
    if (k === "objetivo_mensual") {
      const n = Number(values[k]);
      if (!Number.isInteger(n) || n < 0 || n > 50) throw new UserError("El objetivo mensual tiene que ser un número entre 0 y 50.", { objetivo_mensual: "Número inválido." });
      v = n;
    } else if (CONFIG_TEXTOS.includes(k)) {
      // Mensajes: texto libre con saltos de línea. Vacío = volver al mensaje por defecto.
      const t = String(values[k] ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, 1000);
      if (k === "mensaje_grupo" && t && !t.includes("{link_grupo}")) {
        throw new UserError("El mensaje de invitación al grupo tiene que incluir {link_grupo}.", { mensaje_grupo: "Falta {link_grupo}." });
      }
      v = t || DEFAULT_CONFIG[k];
    } else if (k === "regiones_interior") {
      const lineas = String(values[k] ?? "").split(/\r?\n/).map((s) => cleanString(s, 1000)).filter(Boolean);
      const error = validarRegiones(lineas);
      if (error) throw new UserError(error, { regiones_interior: error });
      // Se guarda ya normalizado: «RÍO URUGUAY = Paso De Los Libres, Santo Tomé».
      v = parseRegiones(lineas).map((r) => `${r.nombre} = ${r.localidades.join(", ")}`);
    } else {
      v = String(values[k] ?? "").split(/\r?\n/).map((s) => cleanString(s, 100)).filter(Boolean);
    }
    await setConfigValue(k, configToValue(k, v), CONFIG_LABELS[k].descripcion, user);
  }
}
