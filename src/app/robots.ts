import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

// FAZ 3 — Bölüm 7: robots.txt hazırlığı. /admin ve /api altındaki hiçbir
// şey indexlenmemeli (admin zaten NextAuth ile korunuyor, bkz.
// docs/security.md — bu ek bir savunma katmanı, tek başına yetkilendirme
// değil). /arama dinamik sorgu sonucu sayfaları da (sitemap.ts'teki aynı
// gerekçeyle) disallow edildi.
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/arama"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
