import type { Metadata } from "next";
import "./globals.css";
import { getSiteUrl } from "@/lib/seo";
import { SessionProviderClient } from "@/components/SessionProviderClient";

// FAZ 3 — Bölüm 7: metadataBase, alt sayfaların generateMetadata()'sında
// döndürdüğü göreli Open Graph görsel URL'lerinin (ör. ürün görseli göreli
// bir path olsaydı) doğru mutlak URL'e çözülmesi için gerekli. Şu an her
// sayfa zaten absoluteUrl() ile mutlak URL üretiyor (bkz. src/lib/seo.ts)
// ama metadataBase'in eksik olması Next.js'in build sırasında uyarı
// vermesine neden oluyordu — bu düzeltildi.
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
      </head>
      <body>
        {/* FAZ 4A — Bölüm 1: NextAuth session context artık ROOT layout'ta
            (yalnızca /admin altında değil) — hem admin panel hem
            /giris,/kayit,/hesabim,/sepet,/hesabim/adresler ve header'daki
            CartBadge/hesap linki `useSession()` ile aynı, tek session
            kaynağını okuyor. src/app/admin/layout.tsx'teki AYRI
            SessionProviderClient kaldırıldı (iki iç içe provider gereksizdi). */}
        <SessionProviderClient>{children}</SessionProviderClient>
      </body>
    </html>
  );
}
