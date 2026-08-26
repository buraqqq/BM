import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

// FAZ 3 — Bölüm 7: sitemap.xml hazırlığı. Next.js'in dosya-tabanlı sitemap
// API'si (bu dosya) derlenip /sitemap.xml olarak sunulur — ayrı bir route
// handler yazmaya gerek yok. Yalnızca isActive ürün/kategoriler dahil
// edilir (arama/filtre sonucu sayfaları — /arama, /urunler?... — kasıtlı
// olarak DIŞARIDA bırakıldı; bunlar sonsuz kombinasyon üretebilen dinamik
// sorgu sayfaları, sitemap'te olmamaları gereken klasik bir SEO pratiği).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.product.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/urunler`, changeFrequency: "daily", priority: 0.9 },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${siteUrl}/kategori/${c.slug}`,
    lastModified: c.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${siteUrl}/urun/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
