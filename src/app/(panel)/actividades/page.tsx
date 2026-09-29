import type { SP } from "@/lib/view";
import { VistaActividades } from "./vista";

export const metadata = { title: "Actividades" };

export default function Actividades({ searchParams }: { searchParams: Promise<SP> }) {
  return <VistaActividades vista="listado" searchParams={searchParams} />;
}
