// ==========================================================
// FAZ 3 — Bölüm 7: SEO yardımcıları — canonical URL üretimi ve mutlak
// (absolute) URL çözümlemesi. Next.js metadata API'si (generateMetadata)
// göreli path kabul eder ama Open Graph/canonical <link> etiketleri için
// mutlak URL gerekir — bu yüzden tek bir merkezi fonksiyon kullanılır.
// ==========================================================

const FALLBACK_SITE_URL = "http://localhost:3000";

/**
 * Aday değeri normalize eder: boş/geçersiz değerler elenir, şemasız
 * değerlere `https://` eklenir ve sondaki slash'ler temizlenir.
 * `null` dönerse bir sonraki aday denenir — böylece `new URL()` çağıran
 * hiçbir yer (ör. layout metadataBase) build sırasında patlamaz.
 */
function normalizeCandidate(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return withScheme.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getSiteUrl(): string {
  // Vercel: NEXT_PUBLIC_APP_URL boş ("" olarak tanımlı) olsa bile build
  // patlamasın diye önce normalize edilmiş adaylar denenir, en son localhost'a
  // düşülür. VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL build sırasında
  // Vercel tarafından otomatik sağlanır — elle tanımlanması gerekmez.
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];
  for (const candidate of candidates) {
    const resolved = normalizeCandidate(candidate);
    if (resolved) return resolved;
  }
  return FALLBACK_SITE_URL;
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
