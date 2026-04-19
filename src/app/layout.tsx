export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const poppins = Poppins({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Respondy - IA para agendar citas automáticamente",
  description: "Conecta tu WhatsApp con IA y agenda citas en Google Calendar automáticamente. Para peluquerías, dentistas, médicos y más.",
  icons: "/favicon.ico",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <meta property="og:title" content="Respondy - IA para agendar citas" />
        <meta property="og:description" content="Automatiza tus citas con WhatsApp + IA + Google Calendar" />
      </head>
      <body className={`${inter.className} ${poppins.variable} bg-white text-gray-900`}>
        {children}
      </body>
    </html>
  );
}
