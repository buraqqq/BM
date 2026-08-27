import { describe, it, expect } from "vitest";
import { computeAffiliateMetrics } from "@/lib/services/analytics.service";

describe("computeAffiliateMetrics", () => {
  it("boş loglar → 0 tıklama, N/A satıcı, null başarı oranı (uydurma 100 YOK)", () => {
    const m = computeAffiliateMetrics([]);
    expect(m.totalClicks).toBe(0);
    expect(m.topMerchant).toBe("N/A");
    expect(m.matchSuccessRate).toBeNull();
    expect(m.clicksByDay).toEqual([]);
  });

  it("tıklamaları satıcıya ve güne göre sayar, en çok satıcıyı bulur", () => {
    const logs = [
      { action: "AFFILIATE_CLICK", metadataJson: JSON.stringify({ vendor: "Trendyol" }), createdAt: new Date("2026-08-27T10:00:00Z") },
      { action: "AFFILIATE_CLICK", metadataJson: JSON.stringify({ vendor: "Trendyol" }), createdAt: new Date("2026-08-27T11:00:00Z") },
      { action: "AFFILIATE_CLICK", metadataJson: JSON.stringify({ vendor: "Amazon.com.tr" }), createdAt: new Date("2026-08-26T10:00:00Z") },
      { action: "AFFILIATE_CLICK", metadataJson: null, createdAt: new Date("2026-08-26T11:00:00Z") },
    ];
    const m = computeAffiliateMetrics(logs);
    expect(m.totalClicks).toBe(4);
    expect(m.topMerchant).toBe("Trendyol");
    expect(m.clicksByDay).toHaveLength(2);
  });

  it("match başarı oranını tasarım loglarından hesaplar (iç / toplam)", () => {
    const logs = [
      { action: "AI_DESIGN_GENERATED", metadataJson: JSON.stringify({ internalCount: 3, affiliateCount: 1 }), createdAt: new Date() },
      { action: "AI_DESIGN_GENERATED", metadataJson: JSON.stringify({ internalCount: 1, affiliateCount: 1 }), createdAt: new Date() },
    ];
    const m = computeAffiliateMetrics(logs);
    expect(m.matchSuccessRate).toBe(67); // 4/6 ≈ %67
  });

  it("bozuk metadata güvenle atlanır (asla patlamaz)", () => {
    const logs = [
      { action: "AFFILIATE_CLICK", metadataJson: "{bozuk", createdAt: new Date() },
      { action: "AI_DESIGN_GENERATED", metadataJson: "{bozuk", createdAt: new Date() },
    ];
    const m = computeAffiliateMetrics(logs);
    expect(m.totalClicks).toBe(1);
    expect(m.topMerchant).toBe("unknown");
    expect(m.matchSuccessRate).toBeNull();
  });
});
