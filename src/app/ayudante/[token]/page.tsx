import { SelloLista47 } from "@/components/ui";
import { IconCalendar, IconPin } from "@/components/icons";
import { esMarcandoHuellas } from "@/lib/huellas";
import { ubicacionLabel } from "@/lib/labels";
import { buscarAcceso } from "@/lib/services/ayudantes";
import { formatDate, titleCase } from "@/lib/util";
import { EntrarAyudante } from "./entrar-form";

export const metadata = { title: "Ayudar en una actividad", robots: { index: false } };

/**
 * Entrada con el QR de ayudante: muestra la actividad, pide el nombre y deja a la persona
 * cargando en esa actividad (sin usuario ni cuenta de Google).
 */
export default async function EntradaAyudante({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await buscarAcceso(token);

  return (
    <main className="flex min-h-dvh flex-col bg-fondo">
      <section className="bg-institucional px-6 pt-12 pb-14 text-white">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <SelloLista47 size={72} />
          <p className="mt-4 text-xs font-bold tracking-[0.22em] text-white/80 uppercase">Lista 47 · Gestión Territorial</p>
          <h1 className="mt-2 text-[26px] leading-tight font-extrabold">¡Gracias por ayudar!</h1>
        </div>
      </section>

      <section className="mx-auto -mt-8 w-full max-w-md flex-1 px-4 pb-10">
        <div className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-linea">
          {!r.ok ? (
            <div className="text-center">
              <p className="text-[18px] font-extrabold">Este acceso ya no está vigente</p>
              <p className="mt-2 text-[16px] text-gris">
                {r.motivo === "vencido" ? "Venció o lo cortó la persona responsable." : "El código no es válido."} Pedile a quien organiza la actividad que te muestre un QR nuevo.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[13px] font-extrabold tracking-[0.14em] text-marca uppercase">
                {esMarcandoHuellas(r.a) ? "Vas a registrar atenciones" : "Vas a tomar asistencia"}
              </p>
              <h2 className="mt-1 font-titulo text-[22px] leading-tight font-extrabold text-petroleo-600">{r.a.nombre}</h2>
              <p className="mt-2 flex items-center gap-2 text-[15px] font-semibold first-letter:uppercase">
                <IconCalendar size={18} className="shrink-0 text-gris" />
                <span className="first-letter:uppercase">
                  {r.a.fecha ? formatDate(r.a.fecha, { weekday: "long", day: "numeric", month: "long" }) : "Sin fecha"}
                  {r.a.hora_inicio && ` · ${r.a.hora_inicio} h`}
                </span>
              </p>
              <p className="mt-1 flex items-start gap-2 text-[15px] text-gris">
                <IconPin size={18} className="mt-0.5 shrink-0" /> {[r.a.lugar, r.a.barrio && titleCase(r.a.barrio), ubicacionLabel(r.a)].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-4 rounded-2xl bg-petroleo-50 px-4 py-3 text-[15px] text-petroleo-600">
                Te sumó <b>{r.inv.creado_por_nombre}</b>. Vas a poder cargar solo en esta actividad, hasta las 23:59 del{" "}
                {formatDate(r.inv.vence.slice(0, 10), { weekday: "long", day: "numeric", month: "long" })}.
              </p>
              <EntrarAyudante token={token} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
