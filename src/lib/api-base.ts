/**
 * Server component'lerin kendi API route'larını (aynı Next.js süreci
 * içinde) çağırabilmesi için taban URL. Bölüm 5/19 — frontend hiçbir
 * zaman veritabanına doğrudan bağlanmaz, her zaman API üzerinden okur.
 */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API isteği başarısız: ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}
