import { formatDate, normalizePhone, titleCase } from "./format";
import { zonaLabel } from "./labels";
import type { Actividad } from "./schema";

/**
 * Resumen de una actividad para mandar por WhatsApp (ej. a un referente para su agenda).
 * Solo datos públicos de la actividad y cantidades: nunca datos de personas.
 */
export function mensajeActividad(a: Actividad, n: { inscriptos: number; presentes: number }): string {
  const cuando = a.fecha
    ? `${formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" })}${a.hora_inicio ? `, ${a.hora_inicio}${a.hora_fin ? ` a ${a.hora_fin}` : ""} h` : ""}`
    : "Fecha a confirmar";
  const donde = [zonaLabel(a.zona), a.barrio ? `B° ${titleCase(a.barrio)}` : "", a.lugar, a.direccion].filter(Boolean).join(" · ");
  const lineas = [
    `📅 *${a.nombre}*`,
    cuando.charAt(0).toUpperCase() + cuando.slice(1),
    `📍 ${donde}`,
    a.responsable ? `👤 Responsable: ${a.responsable}` : "",
    a.estado === "REALIZADA"
      ? `✅ Realizada: ${n.presentes} asistentes de ${n.inscriptos} inscriptos`
      : `👥 ${n.inscriptos} ${n.inscriptos === 1 ? "inscripto" : "inscriptos"}${a.estado !== "CONFIRMADA" ? ` · ${a.estado.toLowerCase()}` : ""}`,
    a.lat && a.lng ? `🗺️ https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}` : "",
  ];
  return lineas.filter(Boolean).join("\n");
}

function cuandoDonde(a: Actividad): string {
  const cuando = a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "";
  const hora = a.hora_inicio ? `${a.hora_inicio} h` : "";
  const donde = [a.lugar, a.direccion, a.barrio ? `B° ${titleCase(a.barrio)}` : ""].filter(Boolean).join(", ");
  return [cuando, hora].filter(Boolean).join(", ") + (donde ? `, en ${donde}` : "");
}

/** Mensaje para pedirle a una persona inscripta que confirme si va a ir. */
export function mensajeConfirmacion(nombre: string, a: Actividad): string {
  return `Hola ${nombre} 👋 Te escribimos por *${a.nombre}*, al que te inscribiste: ${cuandoDonde(a)}.\n¿Nos confirmás si vas a venir? 🙌`;
}

/** Mensaje con el link de invitación al grupo de WhatsApp de la actividad. */
export function mensajeGrupo(nombre: string, a: Actividad): string {
  return `¡Gracias por confirmar, ${nombre}! 🙌 Sumate al grupo de *${a.nombre}* para recibir las novedades:\n${a.link_grupo}`;
}

/** Link de WhatsApp a un número argentino (10 dígitos) con el mensaje ya escrito. "" si el teléfono no sirve. */
export function whatsappA(telefono: string, texto: string): string {
  const d = normalizePhone(telefono);
  return d.length === 10 ? `https://wa.me/549${d}?text=${encodeURIComponent(texto)}` : "";
}

/** Link para abrir WhatsApp con el mensaje (la persona elige a quién mandarlo). */
export function whatsappCompartir(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
