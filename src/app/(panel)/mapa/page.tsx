import type { SP } from "@/lib/view";
import { VistaActividades } from "../actividades/vista";

export const metadata = { title: "Mapa territorial" };

export default function Mapa({ searchParams }: { searchParams: Promise<SP> }) {
  return <VistaActividades vista="mapa" searchParams={searchParams} />;
}
