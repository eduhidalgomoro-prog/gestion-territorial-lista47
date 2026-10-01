import type { Metadata, Viewport } from "next";
import { Montserrat, Nunito_Sans } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

/** Montserrat: tipografía de cuquicalvano.com. Nunito Sans: equivalente libre de Avenir para textos. */
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["500", "600", "700", "800", "900"], style: ["normal", "italic"] });
const nunito = Nunito_Sans({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Lista 47 · Gestión Territorial", template: "%s · Lista 47" },
  description: "Gestión territorial y organización de actividades · Coalición Cívica ARI Lista 47 · Corrientes.",
  applicationName: "Lista 47 Territorial",
  appleWebApp: { capable: true, title: "Lista 47", statusBarStyle: "default" },
  icons: { apple: "/icons/180", icon: "/icons/192" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#106985",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${montserrat.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
