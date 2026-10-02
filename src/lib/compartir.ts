import { formatDate, normalizePhone, titleCase } from "./format";
import { ubicacionLabel } from "./labels";
import { esMarcandoHuellas } from "./huellas";
import type { Actividad } from "./schema";

/**
 * Resumen de una actividad para mandar por WhatsApp (ej. a un referente para su agenda).
 * Solo datos públicos de la actividad y cantidades: nunca datos de personas.
 */
export function mensajeActividad(a: Actividad, n: { inscriptos: number; presentes: number }): string {
  const cuando = a.fecha
    ? `${formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" })}${a.hora_inicio ? `, ${a.hora_inicio}${a.hora_fin ? ` a ${a.hora_fin}` : ""} h` : ""}`
    : "Fecha a confirmar";
  const donde = [ubicacionLabel(a), a.barrio ? `B° ${titleCase(a.barrio)}` : "", a.lugar, a.direccion].filter(Boolean).join(" · ");
  const lineas = [
    `📅 *${a.nombre}*`,
    cuando.charAt(0).toUpperCase() + cuando.slice(1),
    `📍 ${donde}`,
    a.responsable ? `👤 Responsable: ${a.responsable}` : "",
    esMarcandoHuellas(a)
      ? `🐾 Marcando Huellas: vacunación antirrábica y desparasitación (sin inscripción previa)${a.estado !== "CONFIRMADA" ? ` · ${a.estado.toLowerCase()}` : ""}`
      : a.estado === "REALIZADA"
        ? `✅ Realizada: ${n.presentes} asistentes de ${n.inscriptos} inscriptos`
        : `👥 ${n.inscriptos} ${n.inscriptos === 1 ? "inscripto" : "inscriptos"}${a.estado !== "CONFIRMADA" ? ` · ${a.estado.toLowerCase()}` : ""}`,
    a.lat && a.lng ? `🗺️ https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}` : "",
  ];
  return lineas.filter(Boolean).join("\n");
}

/**
 * Completa una plantilla de mensaje (configurable en Configuración → Listas) con los datos de la persona y la actividad.
 * Comodines: {nombre} {actividad} {cuando} {fecha} {hora} {lugar} {link_grupo}
 */
export function completarMensaje(plantilla: string, nombre: string, a: Actividad): string {
  const fecha = a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "fecha a confirmar";
  const hora = a.hora_inicio ? `${a.hora_inicio} h` : "";
  const lugar = [a.lugar, a.direccion, a.barrio ? `B° ${titleCase(a.barrio)}` : "", a.localidad].filter(Boolean).join(", ") || "lugar a confirmar";
  const valores: Record<string, string> = {
    nombre,
    actividad: a.nombre,
    cuando: [fecha, hora].filter(Boolean).join(", "),
    fecha,
    hora: hora || "horario a confirmar",
    lugar,
    link_grupo: a.link_grupo,
  };
  return plantilla.replace(/\{(\w+)\}/g, (m, k: string) => (k in valores ? valores[k] : m));
}

/** Link de WhatsApp a un número argentino (10 dígitos) con el mensaje ya escrito. "" si el teléfono no sirve. */
export function whatsappA(telefono: string, texto: string): string {
  const d = normalizePhone(telefono);
  return d.length === 10 ? `https://wa.me/549${d}?text=${encodeURIComponent(texto)}` : "";
}

/**
 * Link para agregar la actividad a Google Calendar (funciona en cualquier celular, sin instalar nada).
 * Sin hora: evento de todo el día. Sin hora de fin: dura 2 horas. "" si no tiene fecha.
 */
export function linkCalendario(a: Pick<Actividad, "nombre" | "fecha" | "hora_inicio" | "hora_fin" | "lugar" | "direccion" | "barrio" | "localidad">): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) return "";
  const dia = a.fecha.replace(/-/g, "");
  let fechas: string;
  if (/^\d{2}:\d{2}$/.test(a.hora_inicio)) {
    const [h, m] = a.hora_inicio.split(":").map(Number);
    const fin = /^\d{2}:\d{2}$/.test(a.hora_fin) && a.hora_fin > a.hora_inicio ? a.hora_fin : `${String(Math.min(h + 2, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    fechas = `${dia}T${a.hora_inicio.replace(":", "")}00/${dia}T${fin.replace(":", "")}00`;
  } else {
    const d = new Date(`${a.fecha}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    fechas = `${dia}/${d.toISOString().slice(0, 10).replace(/-/g, "")}`;
  }
  const lugar = [a.lugar, a.direccion, a.barrio ? `B° ${titleCase(a.barrio)}` : "", a.localidad || "Corrientes"].filter(Boolean).join(", ");
  const p = new URLSearchParams({ action: "TEMPLATE", text: a.nombre, dates: fechas, ctz: "America/Argentina/Buenos_Aires", location: lugar });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Link para abrir WhatsApp con el mensaje (la persona elige a quién mandarlo). */
export function whatsappCompartir(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
