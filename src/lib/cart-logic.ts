// ==========================================================
// FAZ 4A — Bölüm 13/14/15/16/17/19: sepetle ilgili SAF (DB'siz) iş mantığı.
//
// Neden ayrı bir dosya: mevcut mimarideki kurulmuş desen (bkz. price-sort.ts,
// pricing.ts) — hesaplama/karar mantığı saf fonksiyonlarda tutulur, gerçek
// Prisma çağrıları API route'larında (src/app/api/cart/**) ince bir katman
// olarak kalır. Bu, hem birim testini DB'siz/hızlı yapar (bkz.
// src/lib/__tests__/cart-logic.test.ts) hem de "fiyat hesaplama mantığını
// ikinci kez yazma" ilkesiyle tutarlıdır — buradaki HİÇBİR fonksiyon
// computeFinalPrice'ın yaptığı işi tekrar etmiyor, yalnızca zaten hesaplanmış
// fiyatları/miktarları birleştirip topluyor.
// ==========================================================

export interface CartLineForTotal {
  quantity: number;
  currentFinalPrice: number;
}

export interface CartTotals {
  itemCount: number; // toplam adet (quantity toplamı)
  lineCount: number; // sepetteki farklı ürün sayısı
  subtotal: number; // Bölüm 17: SUM(quantity * current/accepted price)
}

/**
 * Bölüm 17 — "Sadece: SUM(quantity * current/accepted cart price) mantığını
 * doğru şekilde tanımla." Kasıtlı olarak `unitPriceAtAdd` (bayat snapshot)
 * DEĞİL, çağıranın verdiği GÜNCEL final fiyatı toplar — "fiyat değişikliği
 * sessizce uygulanmamalı" kuralı, toplamın kendisini eskiye kilitlemek
 * yerine, her satırda eski/yeni fiyatı AYRICA göstermekle (bkz.
 * detectPriceChange) sağlanıyor; toplam her zaman doğru/güncel olmalı.
 */
export function computeCartTotals(lines: CartLineForTotal[]): CartTotals {
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.currentFinalPrice, 0);
  return { itemCount, lineCount: lines.length, subtotal: Math.round(subtotal * 100) / 100 };
}

export interface PriceChangeResult {
  changed: boolean;
  oldPrice: number;
  newPrice: number;
}

/** Bölüm 16 — "Bu ürünün fiyatı değişti" tespiti. Kuruş farkları (float) gürültü olmasın diye 0.01 TL toleransla karşılaştırır. */
export function detectPriceChange(unitPriceAtAdd: number, currentFinalPrice: number): PriceChangeResult {
  const changed = Math.abs(unitPriceAtAdd - currentFinalPrice) >= 0.01;
  return { changed, oldPrice: unitPriceAtAdd, newPrice: currentFinalPrice };
}

/**
 * Bölüm 14 — miktar minimum 1, stok takip ediliyorsa stok miktarını
 * aşamaz. `availableStock: null` = stok takip edilmiyor/sınırsız (bkz.
 * Inventory ilişkisi opsiyonel) — bu durumda yalnızca alt sınır uygulanır.
 */
export function clampQuantity(requested: number, availableStock: number | null): number {
  const min1 = Math.max(1, Math.floor(requested));
  if (availableStock === null) return min1;
  return Math.min(min1, Math.max(0, availableStock));
}

/** Bölüm 13 — "stock = 3, quantity = 4 eklenmeye çalışılırsa reddet." Sepete EKLEME anında (mevcut miktar + eklenecek miktar) stoğu aşarsa true döner — reddetme kararı route'ta buna göre verilir. */
export function exceedsStock(currentQuantityInCart: number, additionalQuantity: number, availableStock: number | null): boolean {
  if (availableStock === null) return false;
  return currentQuantityInCart + additionalQuantity > availableStock;
}

export interface MergeCartLine {
  productId: string;
  quantity: number;
  /** Prisma satırının createdAt'i — hangi snapshot'ın "daha yeni" olduğuna karar vermek için (bkz. dosya başlığı). */
  createdAt: number; // epoch ms — pure fonksiyon Date nesnesi almıyor (testte sabit sayı vermek daha kolay/deterministik)
}

export interface MergedCartLine {
  productId: string;
  quantity: number;
  /** true ise bu ürün her iki sepette de vardı (miktarlar toplanıp stok sınırına göre kısıldı) — çağıran bu satır için fiyatı YENİDEN hesaplamalı (computeFinalPrice), snapshot'ı burada tahmin ETMİYORUZ. */
  merged: boolean;
}

/**
 * Bölüm 19 — guest sepeti (A) + kullanıcı sepeti (B) birleştirme kuralı.
 * Aynı productId'de miktarlar TOPLANIR, stok limitini AŞMAZ (stok
 * bilgisi olan ürünler için `stockByProductId` map'inden okunur; map'te
 * olmayan/`null` olan ürünler için sınırsız kabul edilir). Fiyat/snapshot
 * BURADA belirlenmez — yalnızca hangi ürünlerin hangi miktarda birleştiği
 * saf olarak hesaplanır; gerçek merge işlemi (route) birleşen satırlar için
 * computeFinalPrice'ı YENİDEN çağırıp unitPriceAtAdd'i tazeler (Bölüm 15 ile
 * tutarlı — pricing engine ikinci kez YAZILMIYOR, yalnızca tekrar ÇAĞRILIYOR).
 */
export function mergeCartItems(
  guestItems: MergeCartLine[],
  userItems: MergeCartLine[],
  stockByProductId: Record<string, number | null>
): MergedCartLine[] {
  const byProduct = new Map<string, { quantity: number; merged: boolean }>();

  for (const item of userItems) {
    byProduct.set(item.productId, { quantity: item.quantity, merged: false });
  }
  for (const item of guestItems) {
    const existing = byProduct.get(item.productId);
    if (existing) {
      byProduct.set(item.productId, { quantity: existing.quantity + item.quantity, merged: true });
    } else {
      byProduct.set(item.productId, { quantity: item.quantity, merged: false });
    }
  }

  return [...byProduct.entries()].map(([productId, v]) => {
    const stock = Object.prototype.hasOwnProperty.call(stockByProductId, productId) ? stockByProductId[productId] : null;
    const quantity = stock === null ? v.quantity : Math.min(v.quantity, Math.max(1, stock));
    return { productId, quantity, merged: v.merged };
  });
}
