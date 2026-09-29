import { formatDate, titleCase } from "./format";
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

/** Link para abrir WhatsApp con el mensaje (la persona elige a quién mandarlo). */
export function whatsappCompartir(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
