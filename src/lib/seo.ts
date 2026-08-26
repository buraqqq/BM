// ==========================================================
// FAZ 3 — Bölüm 7: SEO yardımcıları — canonical URL üretimi ve mutlak
// (absolute) URL çözümlemesi. Next.js metadata API'si (generateMetadata)
// göreli path kabul eder ama Open Graph/canonical <link> etiketleri için
// mutlak URL gerekir — bu yüzden tek bir merkezi fonksiyon kullanılır.
// ==========================================================

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
