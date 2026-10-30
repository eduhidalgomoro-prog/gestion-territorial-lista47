import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/auth";
import { snapshot } from "@/lib/db";
import { lineaDeTiempo, type Encuentro } from "@/lib/linea-de-tiempo";
import { formatDate, nombreMes, slugify, today } from "@/lib/util";
import { filtrosDe } from "@/lib/view";

export const runtime = "nodejs";

/** Línea de tiempo del mes en PDF (se descarga directo, sin pasar por «Imprimir»). Mismos filtros que la página. */

const C = { petroleo: "#106985", marca: "#3f742c", verde: "#66ba47", tinta: "#1f2a33", gris: "#5f6b76", linea: "#dfe4e8", fondo: "#f3f5f6" };

const st = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 44, paddingHorizontal: 38, fontFamily: "Helvetica", fontSize: 9.5, color: C.tinta },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.linea },
  sello: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.verde, alignItems: "center", justifyContent: "center", marginRight: 10 },
  selloTxt: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 7 },
  selloNum: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: -1 },
  kicker: { fontSize: 7.5, letterSpacing: 1.5, color: C.gris, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.petroleo, marginTop: 2 },
  ambito: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  datos: { flexDirection: "row", marginTop: 12 },
  dato: { flex: 1, backgroundColor: C.fondo, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, marginRight: 6 },
  datoK: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: C.gris, letterSpacing: 0.6 },
  datoV: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 1 },
  porTipo: { marginTop: 6, fontSize: 8.5, color: C.gris },
  dias: { marginTop: 14 },
  dia: { borderLeftWidth: 1.5, borderLeftColor: C.linea, marginLeft: 5, paddingLeft: 13, paddingBottom: 10 },
  // Centrado sobre la línea vertical (13 de sangría + 0,75 de la línea + 5 de radio).
  punto: { position: "absolute", left: -18.75, top: 1.5, width: 10, height: 10, borderRadius: 5, backgroundColor: C.marca, borderWidth: 2, borderColor: "#fff" },
  diaTit: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  card: { flexDirection: "row", borderWidth: 1, borderColor: C.linea, borderRadius: 6, padding: 7, marginBottom: 5 },
  hora: { width: 38, fontFamily: "Helvetica-Bold", color: C.petroleo, fontSize: 10 },
  cuerpo: { flex: 1 },
  nombre: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  clase: { fontFamily: "Helvetica", color: C.gris, fontSize: 8.5 },
  linea: { color: C.gris, fontSize: 8.3, marginTop: 1.5, lineHeight: 1.3 },
  estado: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.gris, backgroundColor: C.fondo, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 5, marginLeft: 6, alignSelf: "flex-start" },
  vacio: { marginTop: 18, padding: 14, backgroundColor: C.fondo, borderRadius: 6, color: C.gris, textAlign: "center" },
  pie: { position: "absolute", bottom: 18, left: 38, right: 38, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.gris },
});

function Tarjeta({ e }: { e: Encuentro }) {
  return (
    <View style={st.card} wrap={false}>
      <Text style={st.hora}>{e.hora || "—"}</Text>
      <View style={st.cuerpo}>
        <Text style={st.nombre}>
          {e.nombre}
          {e.clase ? <Text style={st.clase}>{`  (${e.clase})`}</Text> : null}
        </Text>
        {e.detalle ? <Text style={st.linea}>{e.detalle}</Text> : null}
        <Text style={st.linea}>{[e.horario, e.responsable && `Responsable: ${e.responsable}`, e.inscriptos].filter(Boolean).join(" · ")}</Text>
      </View>
      {e.estado ? <Text style={st.estado}>{e.estado.toUpperCase()}</Text> : null}
    </View>
  );
}

export async function GET(request: NextRequest) {
  const yo = await usuarioActual();
  if (!yo) return NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 });
  const q = Object.fromEntries(request.nextUrl.searchParams.entries());
  const f = filtrosDe(q);
  const hoy = today();
  const anio = f.anio || Number(hoy.slice(0, 4));
  const mes = f.mes || Number(hoy.slice(5, 7));
  const { ambito, etiquetaAmbito, dias, resumen } = lineaDeTiempo(await snapshot(), f, anio, mes);
  const mesTxt = `${nombreMes(mes).toLowerCase()} ${anio}`;

  const doc = (
    <Document title={`Actividades de ${mesTxt} · ${etiquetaAmbito}`} author="Gestión Territorial · Lista 47">
      <Page size="A4" style={st.page}>
        <View style={st.header}>
          <View style={st.sello}>
            <Text style={st.selloTxt}>LISTA</Text>
            <Text style={st.selloNum}>47</Text>
          </View>
          <View>
            <Text style={st.kicker}>COALICIÓN CÍVICA ARI · LISTA 47</Text>
            <Text style={st.h1}>Actividades de {mesTxt}</Text>
            <Text style={st.ambito}>{etiquetaAmbito}</Text>
          </View>
        </View>

        <View style={st.datos}>
          {[
            ["ACTIVIDADES", resumen.actividades],
            ["ENCUENTROS", resumen.encuentros],
            ["DÍAS CON ACTIVIDAD", resumen.dias],
            ambito ? ["TIPOS", resumen.tipos] : ["CAPITAL / INTERIOR", `${resumen.capital} / ${resumen.interior}`],
          ].map(([k, v], i) => (
            <View key={String(k)} style={[st.dato, i === 3 ? { marginRight: 0 } : {}]}>
              <Text style={st.datoK}>{k}</Text>
              <Text style={st.datoV}>{String(v)}</Text>
            </View>
          ))}
        </View>
        {resumen.actividades > 0 && <Text style={st.porTipo}>Por tipo: {resumen.porTipo}</Text>}

        {!dias.length ? (
          <Text style={st.vacio}>No hay actividades cargadas para {mesTxt} con estos filtros.</Text>
        ) : (
          <View style={st.dias}>
            {dias.map((d) => (
              <View key={d.fecha} style={st.dia}>
                {/* La fecha nunca queda sola al pie de la hoja: viaja con su primera actividad. */}
                <View wrap={false}>
                  <View style={st.punto} />
                  <Text style={st.diaTit}>{cap(formatDate(d.fecha, { weekday: "long", day: "numeric", month: "long" }))}</Text>
                  <Tarjeta e={d.encuentros[0]} />
                </View>
                {d.encuentros.slice(1).map((e) => <Tarjeta key={`${e.id}-${e.clase}`} e={e} />)}
              </View>
            ))}
          </View>
        )}

        <View style={st.pie} fixed>
          <Text>Gestión Territorial · Lista 47 · generado el {formatDate(hoy, { day: "numeric", month: "long", year: "numeric" })} · sin canceladas ni borradores</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  const pdf = await renderToBuffer(doc);
  const nombre = `actividades-${slugify(nombreMes(mes))}-${anio}${ambito ? `-${ambito}` : ""}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" },
  });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
