import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.APP_NAME || "FBMeter",
  description: "Sondaggi a parole e domande dal pubblico per eventi dal vivo",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
