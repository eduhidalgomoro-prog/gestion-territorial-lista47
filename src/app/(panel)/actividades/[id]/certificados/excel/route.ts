import * as XLSX from "xlsx";
import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth";
import { planillaCertificados } from "@/lib/certificados";
import { snapshot } from "@/lib/db";
import { puede } from "@/lib/permisos";
import { formatDate, formatDni, formatPhone, slugify } from "@/lib/util";

/** Asistencia por persona en Excel (para armar los certificados): una columna por clase, total y si recibe certificado. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const yo = await usuarioActual();
  if (!yo) return NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 });
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a) return NextResponse.json({ error: "La actividad no existe." }, { status: 404 });
  if (!puede.verInscriptos(yo, a, s.asignaciones)) return NextResponse.json({ error: "No tenés permiso para descargar esta planilla." }, { status: 403 });

  const { fechas, minimo, filas, cumplen } = planillaCertificados(a, s, Number(request.nextUrl.searchParams.get("min")) || undefined);
  const conDni = puede.verDniCompleto(yo);
  const conTel = puede.verTelefono(yo);
  const clase = (f: string, i: number) => `Clase ${i + 1}${f ? ` (${formatDate(f, { day: "numeric", month: "numeric" })})` : ""}`;
  const encabezado = ["Apellido", "Nombre", ...(conDni ? ["DNI"] : []), ...(conTel ? ["Teléfono"] : []), ...fechas.map(clase), "Clases", "Certificado"];
  const datos = filas.map((f) => [
    f.apellido, f.nombre, ...(conDni ? [f.dni ? formatDni(f.dni) : ""] : []), ...(conTel ? [f.telefono ? formatPhone(f.telefono) : ""] : []),
    ...f.porClase.map((e) => (e === "PRESENTE" ? "Vino" : e === "AUSENTE" ? "No vino" : "")), `${f.presentes} de ${fechas.length}`, f.cumple ? "Sí" : "No",
  ]);
  const titulo = [`${a.nombre} · Certificado con ${minimo} de ${fechas.length} clases: ${cumplen} personas`];
  const hoja = XLSX.utils.aoa_to_sheet([titulo, [], encabezado, ...datos]);
  hoja["!cols"] = encabezado.map((h) => ({ wch: h === "Apellido" || h === "Nombre" ? 20 : h.startsWith("Clase ") ? 14 : 12 }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Asistencia");
  const buf = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slugify(a.nombre).slice(0, 60) || "taller"}-asistencia-certificados.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
