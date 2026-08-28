import type { Metadata } from "next";
import "./globals.css";
import { getSiteUrl } from "@/lib/seo";
import { SessionProviderClient } from "@/components/SessionProviderClient";
import { PwaInstaller } from "@/components/PwaInstaller";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "B&M Vourla – Bahçe & Mangal | Urla Altıntaş | 0506 055 75 30",
    template: "%s",
  },
  description:
    "Altıntaş Mah. Besim Uyal Cad. No:121/A Urla/İzmir'de mangal, bahçe dekorasyonu, aydınlatma, ısıtma, soğutma ve niş ürünler.",
  openGraph: {
    siteName: "B&M Vourla",
    locale: "tr_TR",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "B&M Vourla – Bahçe & Mangal" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..900&family=Playfair+Display:ital,wght@0,400..900;1,400..700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        {/* FAZ 5 — PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E65100" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
        <link rel="apple-touch-icon" href="/icons/icon-512.png" />
      </head>
      <body>
        <SessionProviderClient>{children}</SessionProviderClient>
        <PwaInstaller />
      </body>
    </html>
  );
}
