import { describe, it, expect } from "vitest";
import { deriveStockStatus } from "@/lib/stock-status";

// Bölüm 18/21/41 — stok durumu türetme kuralı. Bu, daha önce
// /api/admin/inventory/[productId] (delta) ve .../count (fiziksel sayım)
// uçlarında ayrı ayrı tekrarlanan mantığın çıkarıldığı tek kaynaktır.
describe("deriveStockStatus (Bölüm 21 — düşük stok / tükenen ürün eşiği)", () => {
  it("miktar 0 ise OUT_OF_STOCK döner", () => {
    expect(deriveStockStatus(0, 5)).toBe("OUT_OF_STOCK");
  });

  it("miktar negatifse (savunma amaçlı) yine OUT_OF_STOCK döner", () => {
    expect(deriveStockStatus(-2, 5)).toBe("OUT_OF_STOCK");
  });

  it("miktar minimum eşiğe eşitse LOW_STOCK döner", () => {
    expect(deriveStockStatus(5, 5)).toBe("LOW_STOCK");
  });

  it("miktar minimum eşiğin altındaysa LOW_STOCK döner", () => {
    expect(deriveStockStatus(3, 5)).toBe("LOW_STOCK");
  });

  it("miktar minimum eşiğin üzerindeyse IN_STOCK döner", () => {
    expect(deriveStockStatus(6, 5)).toBe("IN_STOCK");
  });

  it("minimum eşik 0 ise ve miktar 1'se IN_STOCK döner (eşik = 'hiç almadan uyar' anlamına gelmez)", () => {
    expect(deriveStockStatus(1, 0)).toBe("IN_STOCK");
  });
});
