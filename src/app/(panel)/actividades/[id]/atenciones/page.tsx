import { AtencionesLista } from "@/components/atenciones-lista";
import { MarcandoHuellasHeader } from "@/components/huellas";
import { Notice } from "@/components/ui";
import { resumenHuellas } from "@/lib/huellas";
import { normalizeText } from "@/lib/util";
import { sp, type SP } from "@/lib/view";
import { cargarOperativo } from "./comun";

export const metadata = { title: "Atenciones" };

export default async function Atenciones({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const q = await searchParams;
  const { s, a, registrar, ver, atenciones } = await cargarOperativo(id);
  if (!ver) return <Notice tone="alerta">Tu rol no tiene acceso a las atenciones de este operativo.</Notice>;
  const personas = new Map(s.participantes.map((p) => [p.id, p]));
  const r = resumenHuellas([a.id], s.atenciones, s.animales);
  const filas = [...atenciones]
    .sort((x, y) => y.registrado.localeCompare(x.registrado))
    .map((x) => {
      const p = personas.get(x.participante_id);
      const nombre = p ? `${p.nombre} ${p.apellido}`.trim() : "—";
      return {
        id: x.id,
        nombre,
        buscar: normalizeText(`${nombre} ${p?.dni ?? ""} ${p?.telefono ?? ""}`),
        perros: x.perros,
        gatos: x.gatos,
        hora: x.registrado ? new Date(x.registrado).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }) : "",
      };
    });

  return (
    <div className="tema-huellas mx-auto max-w-3xl">
      <MarcandoHuellasHeader a={a} atenciones={atenciones.length} puedeRegistrar={registrar} volver={{ href: `/actividades/${a.id}`, label: "Volver al operativo" }} />
      {sp(q, "ok") === "anulada" && <Notice tone="ok" className="mb-3">La atención se anuló.</Notice>}
      <p className="mb-3 text-[16px]">
        <b className="font-titulo text-2xl">{r.responsables}</b> <span className="text-gris">{r.responsables === 1 ? "responsable atendido" : "responsables atendidos"}</span>
        <span className="mx-2 text-gris">·</span>
        <b className="font-titulo text-2xl">{r.animales}</b> <span className="text-gris">{r.animales === 1 ? "animal atendido" : "animales atendidos"}</span>
      </p>
      <AtencionesLista actividadId={a.id} filas={filas} />
    </div>
  );
}
