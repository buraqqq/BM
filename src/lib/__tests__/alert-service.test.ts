import { describe, it, expect } from "vitest";
import { shouldTriggerAlert, alertCreateSchema } from "@/lib/alerts/alert-service";

describe("alert-service — saf tetikleme mantığı", () => {
  it("PRICE_DROP: final fiyat hedefin ALTINDAYSa tetikler", () => {
    expect(shouldTriggerAlert({ alertType: "PRICE_DROP", targetPrice: 100, stockQuantity: null, finalPrice: 99.9 })).toBe(true);
  });

  it("PRICE_DROP: final fiyat hedefe EŞİTSE tetikler", () => {
    expect(shouldTriggerAlert({ alertType: "PRICE_DROP", targetPrice: 100, stockQuantity: null, finalPrice: 100 })).toBe(true);
  });

  it("PRICE_DROP: final fiyat hedefin ÜZERİNDEYSE tetiklemez", () => {
    expect(shouldTriggerAlert({ alertType: "PRICE_DROP", targetPrice: 100, stockQuantity: null, finalPrice: 100.01 })).toBe(false);
  });

  it("PRICE_DROP: targetPrice null ise tetiklemez", () => {
    expect(shouldTriggerAlert({ alertType: "PRICE_DROP", targetPrice: null, stockQuantity: null, finalPrice: 50 })).toBe(false);
  });

  it("STOCK_RESTOCK: stok > 0 ise tetikler", () => {
    expect(shouldTriggerAlert({ alertType: "STOCK_RESTOCK", targetPrice: null, stockQuantity: 5, finalPrice: 120 })).toBe(true);
  });

  it("STOCK_RESTOCK: stok 0 ise tetiklemez", () => {
    expect(shouldTriggerAlert({ alertType: "STOCK_RESTOCK", targetPrice: null, stockQuantity: 0, finalPrice: 120 })).toBe(false);
  });

  it("BACK_IN_STOCK: stok > 0 ise tetikler", () => {
    expect(shouldTriggerAlert({ alertType: "BACK_IN_STOCK", targetPrice: null, stockQuantity: 1, finalPrice: 120 })).toBe(true);
  });

  it("stok takip edilmiyorsa (null) stok alarmı tetiklemez", () => {
    expect(shouldTriggerAlert({ alertType: "STOCK_RESTOCK", targetPrice: null, stockQuantity: null, finalPrice: 120 })).toBe(false);
  });

  it("bilinmeyen alertType tetiklemez", () => {
    expect(shouldTriggerAlert({ alertType: "BOGUS", targetPrice: null, stockQuantity: 10, finalPrice: 1 })).toBe(false);
  });
});

describe("alert-service — alertCreateSchema doğrulaması", () => {
  it("PRICE_DROP hedef fiyat ZORUNLU", () => {
    const r = alertCreateSchema.safeParse({ productId: "p1", alertType: "PRICE_DROP" });
    expect(r.success).toBe(false);
  });

  it("PRICE_DROP geçerli hedef fiyatla kabul edilir", () => {
    const r = alertCreateSchema.safeParse({ productId: "p1", alertType: "PRICE_DROP", targetPrice: "99.90" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.targetPrice).toBe(99.9);
  });

  it("STOCK_RESTOCK hedef fiyat istemez", () => {
    const r = alertCreateSchema.safeParse({ productId: "p1", alertType: "STOCK_RESTOCK" });
    expect(r.success).toBe(true);
  });

  it("STOCK_RESTOCK hedef fiyatla REDDEDILIR (anlamsız)", () => {
    const r = alertCreateSchema.safeParse({ productId: "p1", alertType: "STOCK_RESTOCK", targetPrice: 100 });
    expect(r.success).toBe(false);
  });

  it("bilinmeyen alertType reddedilir", () => {
    const r = alertCreateSchema.safeParse({ productId: "p1", alertType: "HACK" });
    expect(r.success).toBe(false);
  });

  it("negatif hedef fiyat reddedilir", () => {
    const r = alertCreateSchema.safeParse({ productId: "p1", alertType: "PRICE_DROP", targetPrice: -5 });
    expect(r.success).toBe(false);
  });
});
