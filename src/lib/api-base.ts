import { getSiteUrl } from "@/lib/seo";

/**
 * Server component'lerin kendi API route'larını (aynı Next.js süreci
 * içinde) çağırabilmesi için taban URL. Bölüm 5/19 — frontend hiçbir
 * zaman veritabanına doğrudan bağlanmaz, her zaman API üzerinden okur.
 * Tek merkezi çözümleyici getSiteUrl() kullanılır; böylece boş env
 * değerleri (`""`) fetch("" + "/api/...") gibi geçersiz relative URL'lere
 * yol açamaz (bkz. src/lib/seo.ts).
 */
export function getApiBaseUrl(): string {
  return getSiteUrl();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API isteği başarısız: ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}
