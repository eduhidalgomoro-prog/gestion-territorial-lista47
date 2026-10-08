import { Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { zonaLabel } from "@/lib/labels";
import { actividadesVisibles, esResponsable, puede } from "@/lib/permisos";
import type { Actividad, EstadoFlyer, Usuario } from "@/lib/schema";
import { ambitoDe, nombrePropio, regionLabel, zonasDe } from "@/lib/territorio";
import { normalizePhone, today } from "@/lib/util";
import { periodo, sp, type SP } from "@/lib/view";
import { TableroFlyers, type FlyerItem } from "./tablero";

export const metadata = { title: "Flyers" };

/**
 * Comunicación → Flyers: tablero de producción del equipo de diseño.
 * Los datos se arman acá; filtrar, subir piezas y cambiar estados se hace en el tablero sin recargar la página.
 */
export default async function Flyers({ searchParams }: { searchParams: Promise<SP> }) {
  const yo = await requireUser();
  if (!puede.verFlyers(yo)) return <Notice tone="alerta">Tu rol no tiene acceso a la gestión de flyers.</Notice>;
  const q = await searchParams;
  const { anio, mes } = periodo(q);
  const s = await snapshot();
  const responsables = s.usuarios.filter((u) => u.estado === "ACTIVO" && u.rol === "RESPONSABLE" && normalizePhone(u.telefono).length === 10);
  const delPeriodo = actividadesVisibles(yo, s.actividades, s.asignaciones)
    .filter((a) => a.estado !== "CANCELADA" && a.estado !== "BORRADOR")
    .filter((a) => a.anio === anio && (!mes || a.mes === mes))
    // Lo más próximo primero (así lo de mañana no queda debajo de lo de dentro de tres semanas).
    .sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999") || a.hora_inicio.localeCompare(b.hora_inicio));
  const item = (a: Actividad): FlyerItem => aItem(a, responsables, puede.editarFlyer(yo, a));
  const filtros = { estado: sp(q, "estado"), ambito: sp(q, "ambito"), lugar: sp(q, "lugar"), q: sp(q, "q") };

  return (
    <TableroFlyers
      // Si cambia el período, el tablero arranca de nuevo (guardar un estado o subir una pieza no lo reinicia).
      key={`${anio}-${mes}`}
      anio={anio}
      mes={mes}
      hoy={today()}
      conAmbito={!esResponsable(yo)}
      puedeEditar={puede.editarFlyer(yo)}
      items={delPeriodo.filter((a) => a.requiere_flyer).map(item)}
      // Actividades que nadie marcó con «Requiere flyer»: Diseño puede empezar el flyer igual.
      sinPedido={puede.editarFlyer(yo) ? delPeriodo.filter((a) => !a.requiere_flyer).map(item) : []}
      filtrosIniciales={filtros}
    />
  );
}

function aItem(a: Actividad, responsables: Usuario[], editable: boolean): FlyerItem {
  const interior = ambitoDe(a.zona) === "interior";
  const localidad = a.localidad ? nombrePropio(a.localidad) : "";
  return {
    id: a.id,
    nombre: a.nombre,
    fecha: a.fecha,
    horaInicio: a.hora_inicio,
    horaFin: a.hora_fin,
    interior,
    // Interior: la localidad manda («Interior · Goya»). Capital: la zona.
    lugarClave: interior ? localidad || (a.zona === "INTERIOR" ? "" : regionLabel(a.zona)) : a.zona && a.zona !== "GENERAL" ? zonaLabel(a.zona) : "",
    region: interior ? regionLabel(a.zona) : "",
    barrio: a.barrio ? nombrePropio(a.barrio) : "",
    lugar: a.lugar,
    direccion: a.direccion,
    publico: a.publico ? nombrePropio(a.publico) : "",
    responsable: a.responsable,
    detalle: a.detalle,
    inscripcion: a.inscripcion_abierta && a.link_inscripcion ? a.link_inscripcion : "",
    estado: (a.estado_flyer || "SOLICITADO") as EstadoFlyer,
    feed: a.link_flyer,
    historia: a.link_flyer_historia,
    editable,
    // A quién avisar por WhatsApp: el responsable de la zona (actividades generales o sin zona: todos los responsables).
    equipo: responsables
      .filter((u) => a.zona === "GENERAL" || !a.zona || zonasDe(u.zona).includes(a.zona))
      .map((u) => ({ id: u.id, nombre: u.nombre, telefono: normalizePhone(u.telefono) })),
  };
}
