import { slugify } from "@/lib/slug";

// ==========================================================
// Bölüm 27 — Ürün Duplicate Kontrolü
// SKU ve barkod zaten DB seviyesinde @unique. Burada eklenen: aynı/çok
// benzer ürün adı için DETERMİNİSTİK (AI kullanılmadan) bir benzerlik
// kontrolü — basit normalize + Levenshtein mesafesi. Bu bir HARD BLOCK
// değil, admin'e (veya import önizlemesine) gösterilen bir UYARIdır.
// ==========================================================

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

export function normalizeForComparison(name: string): string {
  return slugify(name).replace(/-/g, " ").trim();
}

/**
 * İki ürün adının "çok benzer" olup olmadığını deterministik olarak belirler.
 * Eşik: normalize edilmiş uzunluğun ~%15'inden az fark (min 1, max 4 karakter).
 */
export function isSimilarName(a: string, b: string): boolean {
  const na = normalizeForComparison(a);
  const nb = normalizeForComparison(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const maxLen = Math.max(na.length, nb.length);
  const threshold = Math.min(4, Math.max(1, Math.round(maxLen * 0.15)));
  return levenshtein(na, nb) <= threshold;
}

export interface ExistingProductRef {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
}

export interface DuplicateWarning {
  type: "SAME_SKU" | "SAME_BARCODE" | "SIMILAR_NAME";
  message: string;
  existingProductId: string;
}

/** Yeni bir ürün adayını mevcut ürünlere karşı kontrol eder, uyarı listesi döner (hard block değil). */
export function checkDuplicates(
  candidate: { name: string; sku?: string | null; barcode?: string | null },
  existing: ExistingProductRef[]
): DuplicateWarning[] {
  const warnings: DuplicateWarning[] = [];
  for (const e of existing) {
    if (candidate.sku && e.sku && candidate.sku.trim().toLowerCase() === e.sku.trim().toLowerCase()) {
      warnings.push({ type: "SAME_SKU", message: `Aynı SKU zaten mevcut: ${e.sku} (${e.name})`, existingProductId: e.id });
    }
    if (candidate.barcode && e.barcode && candidate.barcode.trim() === e.barcode.trim()) {
      warnings.push({ type: "SAME_BARCODE", message: `Aynı barkod zaten mevcut: ${e.barcode} (${e.name})`, existingProductId: e.id });
    }
    if (isSimilarName(candidate.name, e.name)) {
      warnings.push({ type: "SIMILAR_NAME", message: `Çok benzer isimli ürün zaten mevcut: "${e.name}"`, existingProductId: e.id });
    }
  }
  return warnings;
}
