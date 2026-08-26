/**
 * Bölüm 12/13/20 — "tarih aralığı dışında gösterilmeyecek / uygulanmayacak"
 * kuralının saf (pure) fonksiyonu. Hem Banner hem Campaign için kullanılır.
 * API route'ları bunu kullanır; test edilebilir olması için ayrı bir
 * modüle çıkarılmıştır (bkz. Bölüm 26 — banner date logic testi).
 */
export function isCurrentlyActiveByDateRange(
  now: Date,
  startDate: Date,
  endDate: Date,
  isActive: boolean
): boolean {
  if (!isActive) return false;
  return startDate.getTime() <= now.getTime() && now.getTime() <= endDate.getTime();
}
