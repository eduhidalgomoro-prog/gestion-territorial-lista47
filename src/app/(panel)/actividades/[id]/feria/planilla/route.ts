import * as XLSX from "xlsx";
import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { planillaFeria } from "@/lib/services/ferias";
import { formatDate, formatDni, formatPhone, slugify } from "@/lib/util";

/**
 * Planilla de la feria en Excel (para mandar al grupo y controlar el día de la feria):
 * N° de gazebo, tipo, responsable, teléfono y emprendimiento, con una columna para marcar si vino.
 */
export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const yo = await usuarioActual();
  if (!yo) return NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 });
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id && x.es_feria);
  if (!a) return NextResponse.json({ error: "La feria no existe." }, { status: 404 });
  if (!puede.editarActividad(yo, a)) return NextResponse.json({ error: "No tenés permiso para descargar esta planilla." }, { status: 403 });

  const conTel = puede.verTelefono(yo);
  const conDni = puede.verDniCompleto(yo);
  const filas = planillaFeria(s, a.id);
  const fecha = a.fecha ? formatDate(a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "";
  const encabezado = ["N° gazebo", "Tipo", "Responsable", ...(conTel ? ["Teléfono"] : []), ...(conDni ? ["DNI"] : []), "Emprendimiento", "Rubro", "¿Vino?"];
  const datos = filas.map((f) => [
    f.puesto || "Sin puesto", f.tipo, f.responsable, ...(conTel ? [f.telefono ? formatPhone(f.telefono) : ""] : []), ...(conDni ? [f.dni ? formatDni(f.dni) : ""] : []),
    f.emprendimiento, f.rubro, f.asistio === "SI" ? "Sí" : f.asistio === "NO" ? "No" : "",
  ]);
  const titulo = [`${a.nombre}${fecha ? ` · ${fecha}` : ""}${a.lugar ? ` · ${a.lugar}` : ""}`];
  const hoja = XLSX.utils.aoa_to_sheet([titulo, [], encabezado, ...datos]);
  hoja["!cols"] = encabezado.map((h) => ({ wch: { "N° gazebo": 10, Tipo: 14, Responsable: 28, Teléfono: 16, DNI: 12, Emprendimiento: 30, Rubro: 18, "¿Vino?": 8 }[h] ?? 14 }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Puestos");
  const buf = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombre = `${slugify(a.nombre) || "feria"}-puestos.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
