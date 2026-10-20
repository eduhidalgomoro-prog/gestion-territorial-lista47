import { SelloLista47 } from "@/components/ui";

export const metadata = { title: "Ayudante", robots: { index: false } };

/** Fin del acceso de ayudante: salió por su cuenta, o venció / se lo cortaron. */
export default async function FinAyudante({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const salio = motivo === "salio";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-fondo px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-lg ring-1 ring-linea">
        <div className="flex justify-center"><SelloLista47 size={64} /></div>
        <h1 className="mt-4 font-titulo text-[24px] font-extrabold text-petroleo-600">{salio ? "¡Gracias por ayudar!" : "Tu acceso terminó"}</h1>
        <p className="mt-2 text-[16px] text-gris">
          {salio
            ? "Ya saliste. Todo lo que cargaste quedó guardado."
            : "El acceso de ayudante venció o lo cortó la persona responsable. Lo que cargaste quedó guardado. Si necesitás seguir, pedile un QR nuevo."}
        </p>
      </div>
    </main>
  );
}
