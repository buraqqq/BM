// ==========================================================
// FAZ 3 — Bölüm 2/3: Pagination yardımcıları (saf fonksiyonlar, birim testli).
// ==========================================================

/** Mevcut query parametrelerini koruyarak, yalnızca `page`'i değiştiren bir URL üretir. */
export function buildPageHref(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && key !== "page") usp.set(key, value);
  }
  if (page > 1) usp.set("page", String(page));
  const qs = usp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export type PageToken = number | "...";

/**
 * Windowed sayfa numarası listesi üretir: her zaman ilk/son sayfa görünür,
 * mevcut sayfanın etrafında `siblingCount` kadar komşu gösterilir, aradaki
 * boşluklar "..." ile temsil edilir. ör. (7, 20, 2) -> [1, "...", 5,6,7,8,9, "...", 20]
 */
export function getPageWindow(current: number, total: number, siblingCount = 2): PageToken[] {
  if (total <= 0) return [1];
  const clampedCurrent = Math.min(Math.max(1, current), total);
  const start = Math.max(1, clampedCurrent - siblingCount);
  const end = Math.min(total, clampedCurrent + siblingCount);

  const tokens: PageToken[] = [];
  if (start > 1) {
    tokens.push(1);
    if (start > 2) tokens.push("...");
  }
  for (let p = start; p <= end; p++) tokens.push(p);
  if (end < total) {
    if (end < total - 1) tokens.push("...");
    tokens.push(total);
  }
  return tokens;
}
