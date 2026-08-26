import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B&M Vourla – Bahçe & Mangal | Urla Altıntaş | 0506 055 75 30",
  description:
    "Altıntaş Mah. Besim Uyal Cad. No:121/A Urla/İzmir'de mangal, bahçe dekorasyonu, aydınlatma, ısıtma, soğutma ve niş ürünler.",
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
      </head>
      <body>{children}</body>
    </html>
  );
}
