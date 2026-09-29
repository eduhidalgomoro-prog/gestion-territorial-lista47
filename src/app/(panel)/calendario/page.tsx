import type { SP } from "@/lib/view";
import { VistaActividades } from "../actividades/vista";

export const metadata = { title: "Calendario" };

export default function Calendario({ searchParams }: { searchParams: Promise<SP> }) {
  return <VistaActividades vista="calendario" searchParams={searchParams} />;
}
