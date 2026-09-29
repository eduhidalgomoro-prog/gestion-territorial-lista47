export const metadata = { title: "Aviso de privacidad" };

export default function Privacidad() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-[16px] leading-relaxed">
      <h1 className="mb-4 text-2xl font-extrabold">Aviso de privacidad</h1>
      <p className="mb-3">
        Los datos que completás en los formularios de inscripción (nombre, apellido, DNI, teléfono y barrio) se usan únicamente para
        organizar las actividades de la Coalición Cívica ARI · Lista 47 en la ciudad de Corrientes: registrar tu inscripción, tomar
        asistencia y contactarte por esta u otras actividades del espacio.
      </p>
      <p className="mb-3">
        Los datos no se venden ni se ceden a terceros. Solo acceden a ellos las personas de la organización habilitadas para
        coordinar las actividades, con usuario y permisos según su rol.
      </p>
      <p className="mb-3">
        Conforme a la Ley 25.326 de Protección de Datos Personales, podés pedir en cualquier momento el acceso, la corrección o la
        eliminación de tus datos comunicándote con la organización de la actividad.
      </p>
      <p className="text-sm text-gris">
        La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de
        atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de datos personales.
      </p>
    </main>
  );
}
