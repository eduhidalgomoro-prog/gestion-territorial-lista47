import { IconEye } from "@/components/icons";
import { MobileNav, Sidebar } from "@/components/panel-nav";
import { salirVerComoAction } from "./ver-como-actions";
import { requireUser } from "@/lib/auth";
import { esDiseno, esFerias, esLogistica, misZonas, puede, ROL_LABEL } from "@/lib/permisos";
import { zonaLabel } from "@/lib/labels";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const yo = await requireUser();
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
      <Sidebar nombre={yo.nombre} rol={rol} permisos={permisos} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav permisos={permisos} />
        {yo.vistaPrevia && (
          // «Ver la app como…»: siempre a la vista, con la salida a un toque.
          <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 bg-alerta px-4 py-2 text-white shadow-md lg:top-0 lg:px-10">
            <p className="flex min-w-0 items-center gap-2 text-[14px] font-bold">
              <IconEye size={18} className="shrink-0" />
              <span className="min-w-0">Viendo la app como <b className="underline decoration-white/50 underline-offset-2">{yo.vistaPrevia.etiqueta}</b> · solo para mirar</span>
            </p>
            <form action={salirVerComoAction}>
              <button type="submit" className="h-9 rounded-full bg-white px-3.5 text-[13.5px] font-extrabold text-alerta hover:bg-white/90">Volver a administrador</button>
            </form>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-10">{children}</main>
      </div>
    </div>
  );
}
