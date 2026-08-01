import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EditMyPic — Editor de fotos online",
  description: "Edita, ajusta y exporta tus fotografías directamente desde el navegador.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
