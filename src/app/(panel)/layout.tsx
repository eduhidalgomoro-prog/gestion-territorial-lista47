import { MobileNav, Sidebar } from "@/components/panel-nav";
import { requireUser } from "@/lib/auth";
import { puede, ROL_LABEL } from "@/lib/permisos";
import { zonaLabel } from "@/lib/labels";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const yo = await requireUser();
  const permisos = {
    crear: puede.crearActividad(yo),
    participantes: puede.verParticipantes(yo),
    estadisticas: puede.verEstadisticas(yo),
    configurar: puede.configurar(yo),
  };
  const rol = ROL_LABEL[yo.rol] + (yo.rol === "RESPONSABLE" && yo.zona ? ` · ${zonaLabel(yo.zona)}` : "");
  return (
    <div className="flex min-h-dvh">
      <Sidebar nombre={yo.nombre} rol={rol} permisos={permisos} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav permisos={permisos} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-10">{children}</main>
      </div>
    </div>
  );
}
