import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CopyButton } from "@/components/copy-button";
import { IconArrowLeft, IconUserPlus, IconWhatsApp } from "@/components/icons";
import { SubmitButton } from "@/components/forms";
import { Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { whatsappCompartir } from "@/lib/compartir";
import { snapshot } from "@/lib/db";
import { esMarcandoHuellas } from "@/lib/huellas";
import { puede } from "@/lib/permisos";
import { linkAyudante, vigente } from "@/lib/services/ayudantes";
import { nombreCorto } from "@/lib/taller-nombre";
import { formatDate } from "@/lib/util";
import { cortarAyudanteAction, crearAyudanteAction } from "../../../actions";

export const metadata = { title: "Sumar ayudantes" };

/**
 * Sumar ayudantes con QR: alguien del lugar escanea, escribe su nombre y carga en ESTA actividad
 * (asistencia o atenciones), sin usuario. Vence solo al terminar el día y se puede cortar antes.
 */
export default async function Ayudantes({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requireUser();
  const { id } = await params;
  const s = await snapshot();
  const a = s.actividades.find((x) => x.id === id);
  if (!a || !puede.verActividad(yo, a, s.asignaciones)) notFound();
  if (!puede.sumarAyudantes(yo, a)) return <Notice tone="alerta">Solo quien organiza la actividad puede sumar ayudantes.</Notice>;

  const accesos = (s.ayudantes ?? []).filter((x) => x.actividad_id === id).sort((x, y) => y.creado.localeCompare(x.creado));
  const activos = accesos.filter((x) => vigente(x));
  const pasados = accesos.filter((x) => !vigente(x));
  const qrs = await Promise.all(activos.map((x) => QRCode.toString(linkAyudante(x.token), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0c546b", light: "#ffffff" } })));
  const tarea = esMarcandoHuellas(a) ? "registrar atenciones y animales" : "tomar asistencia y agregar a quienes lleguen";

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <Link href={`/actividades/${id}`} className="-ml-1 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[15px] font-semibold text-petroleo hover:underline">
        <IconArrowLeft size={18} /> Ficha de la actividad
      </Link>
      <header className="mb-4">
        <p className="text-[12px] font-extrabold tracking-[0.16em] text-marca uppercase">Sumar ayudantes</p>
        <h1 className="font-titulo text-[23px] leading-tight font-extrabold text-petroleo-600" title={a.nombre}>{nombreCorto(a.nombre)}</h1>
        <p className="mt-1 text-[15px] text-gris">
          Mostrale el QR a quien te ayude: lo escanea con su celular, escribe su nombre y puede {tarea} <b className="text-tinta">solo en esta actividad</b>. No necesita usuario ni cuenta de Google.
        </p>
      </header>

      {activos.length === 0 ? (
        <form action={crearAyudanteAction.bind(null, id)} className="rounded-[22px] bg-white p-5 text-center shadow-[0_1px_2px_rgba(16,105,133,0.06)] ring-1 ring-linea/70">
          <p className="text-[15px] text-gris">Vence solo a las 23:59 del día de la actividad, y lo podés cortar antes.</p>
          <SubmitButton className="mt-4 w-full">
            <IconUserPlus size={20} /> Crear QR para ayudantes
          </SubmitButton>
        </form>
      ) : (
        activos.map((x, i) => {
          const link = linkAyudante(x.token);
          const quienes = x.ingresaron ? x.ingresaron.split(",").map((n) => n.trim()).filter(Boolean) : [];
          return (
            <section key={x.id} className="mb-4 rounded-[22px] bg-white p-5 shadow-[0_1px_2px_rgba(16,105,133,0.06)] ring-1 ring-linea/70">
              <div className="mx-auto w-full max-w-[260px] rounded-2xl p-2 ring-1 ring-linea [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="Código QR para ayudantes" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
              <p className="mt-3 text-center text-[15px] font-semibold">Vale hasta las 23:59 del {formatDate(x.vence.slice(0, 10), { weekday: "long", day: "numeric", month: "long" })}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a
                  href={whatsappCompartir(`Te sumo como ayudante en «${a.nombre}». Abrí este link, escribí tu nombre y ya podés cargar: ${link}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#1f8f4e] px-4 font-bold text-white hover:bg-[#187a41]"
                >
                  <IconWhatsApp size={20} /> Mandar por WhatsApp
                </a>
                <CopyButton text={link} label="Copiar link" />
              </div>
              <div className="mt-4 rounded-2xl bg-fondo px-4 py-3 text-[15px]">
                {quienes.length ? (
                  <p><b>Ayudando:</b> {quienes.join(", ")}</p>
                ) : (
                  <p className="text-gris">Todavía no entró nadie con este QR.</p>
                )}
              </div>
              <form action={cortarAyudanteAction.bind(null, x.id)} className="mt-3">
                <SubmitButton variant="peligro" size="md" className="w-full">Cortar el acceso ahora</SubmitButton>
              </form>
            </section>
          );
        })
      )}

      {pasados.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[15px] font-extrabold text-gris">Accesos anteriores</h2>
          <ul className="space-y-1.5 text-[14.5px] text-gris">
            {pasados.map((x) => (
              <li key={x.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-linea/70">
                {x.activo ? "Venció" : "Cortado"} · generado por {x.creado_por_nombre}
                {x.ingresaron && <> · ayudaron: <b className="text-tinta">{x.ingresaron}</b></>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
