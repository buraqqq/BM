import { describe, it, expect } from "vitest";
import { computeAlertStats, computeTopAlertedProducts, computeNotificationStats } from "@/lib/analytics-service";

describe("analytics-service — computeAlertStats", () => {
  it("boş liste → toplam 0, tüm dağılımlar 0", () => {
    const stats = computeAlertStats([]);
    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual({ STOCK_RESTOCK: 0, PRICE_DROP: 0, BACK_IN_STOCK: 0 });
    expect(stats.byStatus).toEqual({ pending: 0, triggered: 0, cancelled: 0 });
  });

  it("tip dağılımını doğru sayar", () => {
    const stats = computeAlertStats([
      { alertType: "PRICE_DROP", isTriggered: false },
      { alertType: "PRICE_DROP", isTriggered: true },
      { alertType: "STOCK_RESTOCK", isTriggered: false },
      { alertType: "BACK_IN_STOCK", isTriggered: false },
    ]);
    expect(stats.total).toBe(4);
    expect(stats.byType).toEqual({ STOCK_RESTOCK: 1, PRICE_DROP: 2, BACK_IN_STOCK: 1 });
  });

  it("durum dağılımını isTriggered'a göre ayırır", () => {
    const stats = computeAlertStats([
      { alertType: "PRICE_DROP", isTriggered: false },
      { alertType: "PRICE_DROP", isTriggered: true },
      { alertType: "STOCK_RESTOCK", isTriggered: true },
    ]);
    expect(stats.byStatus.pending).toBe(1);
    expect(stats.byStatus.triggered).toBe(2);
  });

  it("cancelled her zaman 0'dır (şemada CANCELLED durumu yok)", () => {
    const stats = computeAlertStats([
      { alertType: "PRICE_DROP", isTriggered: false },
      { alertType: "PRICE_DROP", isTriggered: true },
    ]);
    expect(stats.byStatus.cancelled).toBe(0);
  });

  it("bilinmeyen alertType tip sayacına girmez ama total'e girer", () => {
    const stats = computeAlertStats([{ alertType: "BOGUS", isTriggered: false }]);
    expect(stats.total).toBe(1);
    expect(stats.byType).toEqual({ STOCK_RESTOCK: 0, PRICE_DROP: 0, BACK_IN_STOCK: 0 });
  });
});

describe("analytics-service — computeTopAlertedProducts", () => {
  it("en çok alarm kurulan ürünleri sıralar", () => {
    const rows = [
      { productId: "p1" },
      { productId: "p2" },
      { productId: "p1" },
      { productId: "p1" },
      { productId: "p3" },
    ];
    const top = computeTopAlertedProducts(rows, 5);
    expect(top).toEqual([
      { productId: "p1", alertCount: 3 },
      { productId: "p2", alertCount: 1 },
      { productId: "p3", alertCount: 1 },
    ]);
  });

  it("limit'e uyar", () => {
    const rows = [
      { productId: "a" },
      { productId: "b" },
      { productId: "c" },
      { productId: "d" },
    ];
    expect(computeTopAlertedProducts(rows, 2)).toHaveLength(2);
  });

  it("boş liste → boş dizi", () => {
    expect(computeTopAlertedProducts([], 5)).toEqual([]);
  });

  it("negatif limit → boş dizi", () => {
    expect(computeTopAlertedProducts([{ productId: "a" }], -1)).toEqual([]);
  });
});

describe("analytics-service — computeNotificationStats", () => {
  it("boş liste → başarı oranı null", () => {
    const stats = computeNotificationStats([]);
    expect(stats.delivered).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.successRate).toBeNull();
  });

  it("delivered true/false dağılımını sayar", () => {
    const stats = computeNotificationStats([
      { metadataJson: JSON.stringify({ delivered: true }) },
      { metadataJson: JSON.stringify({ delivered: true }) },
      { metadataJson: JSON.stringify({ delivered: false }) },
    ]);
    expect(stats.delivered).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.successRate).toBe(67); // 2/3 → %67
  });

  it("metadata yoksa başarısız sayılır", () => {
    const stats = computeNotificationStats([{ metadataJson: null }]);
    expect(stats.delivered).toBe(0);
    expect(stats.failed).toBe(1);
    expect(stats.successRate).toBe(0);
  });

  it("bozuk JSON metadata güvenle başarısız sayılır", () => {
    const stats = computeNotificationStats([{ metadataJson: "{not valid json" }]);
    expect(stats.failed).toBe(1);
    expect(stats.successRate).toBe(0);
  });

  it("tam başarıda %100 döner", () => {
    const stats = computeNotificationStats([{ metadataJson: JSON.stringify({ delivered: true }) }]);
    expect(stats.delivered).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.successRate).toBe(100);
  });
});
