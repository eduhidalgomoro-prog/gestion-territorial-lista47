# Lista 47 · Gestión Territorial

Aplicación web (instalable en celular y computadora) para organizar las actividades territoriales de la
**Coalición Cívica ARI · Lista 47** en la ciudad de Corrientes: planificación mensual, carga de actividades,
logística, ubicación en el mapa, inscripciones, asistencia, cierre, resultados y dashboard.

**Google Sheets es la base de datos**: todo se guarda en un único archivo maestro. La app es la interfaz.

## Tecnología

| Parte | Herramienta |
|---|---|
| App web + servidor | Next.js 16 (React 19) · Tailwind CSS 4 |
| Base de datos | Google Sheets (API oficial, cuenta de servicio) |
| Ingreso | Cuenta de Google (OAuth). El rol sale de la hoja `USUARIOS` |
| Mapa | Leaflet + OpenStreetMap · ubicación de direcciones con Georef (datos.gob.ar) y Nominatim |
| Instalable | PWA (manifest + service worker) con botón «Descargar aplicación» |
| Publicación | GitHub → Vercel |

## Estructura de la planilla maestra

Una hoja por tabla, relacionadas por IDs: `ACTIVIDADES`, `PARTICIPANTES`, `INSCRIPCIONES`, `ASISTENCIAS`,
`REQUERIMIENTOS`, `USUARIOS`, `ASIGNACIONES`, `ZONAS_BARRIOS`, `INSTITUCIONES`, `CONFIG`, `AUDITORIA`.
Las columnas están definidas en [`src/lib/schema.ts`](src/lib/schema.ts). La app ubica cada columna por su
**encabezado**, así que se pueden reordenar o agregar columnas propias sin romper nada. La hoja del formulario
anterior («Respuestas de formulario 1») no se toca.

> Para migrar a una base de datos real (Postgres, Supabase…) se reemplaza solo [`src/lib/store`](src/lib/store):
> el resto de la app no sabe que detrás hay una planilla.

## Puesta en marcha (una sola vez)

### 1. Google Cloud (credenciales)

1. Entrá a <https://console.cloud.google.com/> y creá un proyecto (ej. «lista47-territorial»).
2. **APIs y servicios → Biblioteca**: habilitá **Google Sheets API**.
3. **IAM → Cuentas de servicio → Crear**. Después, en la cuenta: **Claves → Agregar clave → JSON**. Se descarga un archivo.
4. **Compartí la planilla maestra** con el email de la cuenta de servicio (termina en `iam.gserviceaccount.com`) como **Editor**.
5. **APIs y servicios → Pantalla de consentimiento OAuth**: tipo *Externo*, completá nombre y email.
6. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**, con estos
   *URI de redireccionamiento autorizados*:
   - `http://localhost:3000/api/auth/callback`
   - `https://TU-APP.vercel.app/api/auth/callback` (cuando tengas la URL de Vercel)

### 2. Variables de entorno

Copiá `.env.example` como `.env.local` y completá los valores (hay una explicación de cada uno en el archivo).
Nunca subas `.env.local` a GitHub (ya está en `.gitignore`).

### 3. Preparar la planilla y traer los datos actuales

```bash
npm install
npm run check:sheets                      # verifica la conexión
npm run setup:sheets                      # crea las hojas, encabezados y desplegables
npm run migrar:formulario -- --probar     # muestra qué actividades trae del formulario anterior
npm run migrar:formulario                 # las migra (se puede repetir: no duplica)
```

### 4. Probar en la computadora

```bash
npm run dev
```

Con `DATA_BACKEND=local` y `npm run seed:local` se puede probar con datos de prueba sin tocar la planilla real.

### 5. Publicar en Vercel

1. Subí el repositorio a GitHub.
2. En <https://vercel.com/new> importá el repositorio.
3. En **Settings → Environment Variables** cargá las mismas variables de `.env.local`, con
   `DATA_BACKEND=sheets` y `APP_URL=https://TU-APP.vercel.app`.
4. Recomendado: **Storage → Upstash Redis** (gratis). Evita choques cuando varias personas guardan al mismo tiempo.
5. Agregá la URL de Vercel en los URI de redirección del cliente OAuth (paso 1.6).

Cada `git push` a `main` publica una nueva versión automáticamente.

## Roles

| Rol | Puede |
|---|---|
| **Administrador** | Todo: todas las zonas, usuarios, configuración, datos personales completos, costos |
| **Responsable de zona** | Cargar y editar actividades de su zona, inscriptos, asistencia, cierre, estadísticas de su zona |
| **Operador** | Solo las actividades que le asignan: ver inscriptos, tomar asistencia, agregar personas |

Los administradores iniciales se definen en `ADMIN_EMAILS`. Los demás usuarios se crean desde **Configuración**.

## Privacidad

- El formulario público (`/inscripcion/...`) solo permite **enviar** datos: nunca muestra ni confirma quién está en la base.
- DNI completo visible solo para administración. El resto ve los últimos dígitos.
- Cada cambio importante queda registrado en la hoja `AUDITORIA` (quién, qué y cuándo).
- Aviso de privacidad (Ley 25.326) en `/privacidad`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en modo desarrollo |
| `npm run build` | Compila para producción |
| `npm test` | Pruebas automáticas (duplicados, importación, asistencia, cierre, indicadores) |
| `npm run typecheck` / `npm run lint` | Controles de código |
| `npm run setup:sheets` | Prepara la planilla (seguro de repetir) |
| `npm run migrar:formulario` | Trae actividades del Google Forms anterior |
| `npm run seed:local` | Datos de prueba locales |
