import { IconEye } from "@/components/icons";
import { MobileNav, Sidebar } from "@/components/panel-nav";
import { salirVerComoAction } from "./ver-como-actions";
import { requireUser } from "@/lib/auth";
import { esDiseno, esFerias, esLogistica, misZonas, puede, ROL_LABEL } from "@/lib/permisos";
import { zonaLabel } from "@/lib/labels";
import { SelloLista47 } from "@/components/ui";
import { formatDate } from "@/lib/util";
import { salirAyudanteAction } from "../ayudante/actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const yo = await requireUser();
  // Ayudante con QR: sin menú (solo su actividad), con su nombre, hasta cuándo puede cargar y cómo salir.
  if (yo.ayudante) {
    const hasta = formatDate(yo.ayudante.vence.slice(0, 10), { weekday: "long", day: "numeric" });
    return (
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 bg-institucional px-4 py-2.5 text-white shadow-md">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <SelloLista47 size={36} />
              <p className="min-w-0 leading-tight">
                <b className="block truncate text-[15px]">{yo.nombre} · ayudante</b>
                <span className="block truncate text-[12.5px] text-white/85">De {yo.ayudante.de} · hasta las 23:59 del {hasta}</span>
              </p>
            </div>
            <form action={salirAyudanteAction}>
              <button type="submit" className="h-9 shrink-0 rounded-full bg-white/15 px-3.5 text-[13.5px] font-bold ring-1 ring-white/40 hover:bg-white/25">Salir</button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">{children}</main>
      </div>
    );
  }
  const permisos = {
    crear: puede.crearActividad(yo),
    participantes: puede.verParticipantes(yo),
    estadisticas: puede.verEstadisticas(yo),
    configurar: puede.configurar(yo),
    flyers: puede.verFlyers(yo),
    ferias: puede.verFerias(yo),
    logistica: puede.gestionarLogistica(yo),
    inicio: !esDiseno(yo) && !esFerias(yo) && !esLogistica(yo),
  };
  const rol = ROL_LABEL[yo.rol] + (yo.rol === "RESPONSABLE" && yo.zona ? ` · ${misZonas(yo).map(zonaLabel).join(" · ")}` : "");
  return (
    <div className="flex min-h-dvh">
      {/* Al imprimir (o guardar en PDF) solo sale el contenido, sin los menús. */}
      <div className="contents print:hidden">
        <Sidebar nombre={yo.nombre} rol={rol} permisos={permisos} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="contents print:hidden">
          <MobileNav permisos={permisos} />
        </div>
        {yo.vistaPrevia && (
          // «Ver la app como…»: siempre a la vista, con la salida a un toque.
          <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 bg-alerta px-4 py-2 text-white shadow-md lg:top-0 lg:px-10 print:hidden">
            <p className="flex min-w-0 items-center gap-2 text-[14px] font-bold">
              <IconEye size={18} className="shrink-0" />
              <span className="min-w-0">Viendo la app como <b className="underline decoration-white/50 underline-offset-2">{yo.vistaPrevia.etiqueta}</b> · solo para mirar</span>
            </p>
            <form action={salirVerComoAction}>
              <button type="submit" className="h-9 rounded-full bg-white px-3.5 text-[13.5px] font-extrabold text-alerta hover:bg-white/90">Volver a administrador</button>
            </form>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-10 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
