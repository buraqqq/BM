import { describe, it, expect } from "vitest";
import { computeCartTotals, detectPriceChange, clampQuantity, exceedsStock, mergeCartItems } from "@/lib/cart-logic";

// FAZ 4A — Bölüm 33 CART senaryolarının saf (DB'siz) kısmı: Test 14
// (quantity update), 17 (stock exceeded), 19 (price change), 20 (stock
// change), 21/22 (guest→user merge, aynı ürün birleşme), 24/25 (empty cart /
// badge — computeCartTotals). Test 12/13/15/16/18/23 (guest add,
// authenticated add, remove, clear, inactive product, cart ownership) DB+
// HTTP gerektirdiği için scripts/faz4a-commerce-e2e-check.ts'te doğrulanıyor
// (bkz. FAZ4A raporu Bölüm Q — hangi test hangi senaryoyu karşılıyor tablosu).

describe("computeCartTotals — Test 24/25: boş sepet ve rozet sayısı", () => {
  it("boş sepette 0/0/0 döner (Test 24 — empty cart)", () => {
    expect(computeCartTotals([])).toEqual({ itemCount: 0, lineCount: 0, subtotal: 0 });
  });

  it("birden fazla satırın miktar ve tutarını doğru toplar (Test 25 — cart badge)", () => {
    const totals = computeCartTotals([
      { quantity: 2, currentFinalPrice: 100 },
      { quantity: 1, currentFinalPrice: 50 },
    ]);
    expect(totals).toEqual({ itemCount: 3, lineCount: 2, subtotal: 250 });
  });

  it("kuruş yuvarlamasını doğru yapar", () => {
    const totals = computeCartTotals([{ quantity: 3, currentFinalPrice: 33.333 }]);
    expect(totals.subtotal).toBe(100); // 3 * 33.333 = 99.999 -> yuvarlanır
  });
});

describe("detectPriceChange — Test 19: fiyat değişikliği tespiti", () => {
  it("fiyat artmışsa changed:true ve doğru eski/yeni fiyatı döner", () => {
    expect(detectPriceChange(700, 750)).toEqual({ changed: true, oldPrice: 700, newPrice: 750 });
  });
  it("fiyat düşmüşse de changed:true döner", () => {
    expect(detectPriceChange(750, 700).changed).toBe(true);
  });
  it("fiyat aynıysa changed:false döner", () => {
    expect(detectPriceChange(700, 700).changed).toBe(false);
  });
  it("0.01 TL altındaki kayan nokta farkları gürültü sayılmaz", () => {
    expect(detectPriceChange(700, 700.001).changed).toBe(false);
  });
});

describe("clampQuantity — Test 14: quantity update kuralları", () => {
  it("minimum 1'in altına inemez", () => {
    expect(clampQuantity(0, null)).toBe(1);
    expect(clampQuantity(-5, null)).toBe(1);
  });
  it("stok takip edilmiyorsa (null) yalnızca alt sınır uygulanır", () => {
    expect(clampQuantity(500, null)).toBe(500);
  });
  it("stok takip ediliyorsa üst sınırı aşamaz", () => {
    expect(clampQuantity(10, 3)).toBe(3);
  });
  it("stok 0 ise 0'a kısılır (üst katman bunu ayrıca reddeder)", () => {
    expect(clampQuantity(5, 0)).toBe(0);
  });
});

describe("exceedsStock — Test 17/20: stok aşımı ve stok değişikliği", () => {
  it("sorudaki örnek: stock=3, mevcut sepette 0, +4 eklenmeye çalışılırsa reddedilir", () => {
    expect(exceedsStock(0, 4, 3)).toBe(true);
  });
  it("stock=3, mevcut sepette 2, +1 eklenirse tam sınırda kabul edilir", () => {
    expect(exceedsStock(2, 1, 3)).toBe(false);
  });
  it("stock=3, mevcut sepette 2, +2 eklenirse reddedilir (toplam 4 > 3)", () => {
    expect(exceedsStock(2, 2, 3)).toBe(true);
  });
  it("stok takip edilmiyorsa (null) hiçbir zaman reddetmez", () => {
    expect(exceedsStock(1000, 1000, null)).toBe(false);
  });
  it("Test 20 — stok sonradan azaldıysa (sepetteki miktar artık mevcut stoktan fazla), yeni ekleme de reddedilir", () => {
    // Sepette zaten 5 adet var, stok sonradan 3'e düştü — 1 tane daha eklemeye çalışmak reddedilmeli.
    expect(exceedsStock(5, 1, 3)).toBe(true);
  });
});

describe("mergeCartItems — Test 21/22: guest→user sepet birleştirme", () => {
  it("Test 22 — aynı üründe miktarlar toplanır ve merged:true işaretlenir", () => {
    const merged = mergeCartItems(
      [{ productId: "p1", quantity: 2, createdAt: 200 }],
      [{ productId: "p1", quantity: 3, createdAt: 100 }],
      {}
    );
    expect(merged).toEqual([{ productId: "p1", quantity: 5, merged: true }]);
  });

  it("Test 21 — farklı ürünler birleştirilmeden (merged:false) yan yana durur", () => {
    const merged = mergeCartItems([{ productId: "guest-only", quantity: 1, createdAt: 1 }], [{ productId: "user-only", quantity: 2, createdAt: 1 }], {});
    expect(merged.sort((a, b) => a.productId.localeCompare(b.productId))).toEqual([
      { productId: "guest-only", quantity: 1, merged: false },
      { productId: "user-only", quantity: 2, merged: false },
    ]);
  });

  it("birleşen miktar stok sınırını aşmaz", () => {
    const merged = mergeCartItems([{ productId: "p1", quantity: 4, createdAt: 1 }], [{ productId: "p1", quantity: 4, createdAt: 1 }], { p1: 5 });
    expect(merged).toEqual([{ productId: "p1", quantity: 5, merged: true }]);
  });

  it("stok bilgisi olmayan (map'te yok) ürün için sınırsız kabul edilir", () => {
    const merged = mergeCartItems([{ productId: "p1", quantity: 10, createdAt: 1 }], [], {});
    expect(merged).toEqual([{ productId: "p1", quantity: 10, merged: false }]);
  });

  it("iki boş sepetin birleşimi boştur", () => {
    expect(mergeCartItems([], [], {})).toEqual([]);
  });
});
