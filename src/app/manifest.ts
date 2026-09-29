import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lista 47 · Gestión Territorial",
    short_name: "Lista 47",
    description: "Actividades, participantes, asistencia y mapa territorial · CC ARI Lista 47 Corrientes.",
    id: "/inicio",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f7f5",
    theme_color: "#106985",
    lang: "es",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nueva actividad", url: "/actividades/nueva" },
      { name: "Actividades", url: "/actividades" },
      { name: "Mapa", url: "/actividades?vista=mapa" },
    ],
  };
}
