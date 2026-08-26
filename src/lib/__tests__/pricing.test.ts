import { describe, it, expect } from "vitest";
import { computeFinalPrice, applyBulkAdjustment, type CampaignWithProducts } from "@/lib/pricing";

// Bölüm 26 — "price calculation" ve "campaign calculation" testleri.

function campaign(overrides: Partial<CampaignWithProducts> = {}): CampaignWithProducts {
  return {
    id: "camp-1",
    name: "Test Kampanya",
    slug: "test-kampanya",
    description: null,
    discountType: "PERCENTAGE",
    discountValue: 20 as unknown as CampaignWithProducts["discountValue"],
    scope: "GLOBAL",
    categoryId: null,
    startDate: new Date(Date.now() - 86400000),
    endDate: new Date(Date.now() + 86400000),
    isActive: true,
    bannerText: null,
    ctaText: null,
    ctaLink: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    products: [],
    categorySubtreeIds: undefined,
    ...overrides,
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    categoryId: "cat-1",
    price: 1500 as unknown as number,
    compareAtPrice: null,
    salePrice: null,
    ...overrides,
  } as never;
}

describe("computeFinalPrice", () => {
  it("kampanya yokken normal fiyatı döner", () => {
    const result = computeFinalPrice(product(), []);
    expect(result.finalPrice).toBe(1500);
    expect(result.discountSource).toBe("none");
  });

  it("Bölüm 11 senaryosu: 1500 TL üründe %20 kampanya -> 1200 TL final fiyat", () => {
    const camp = campaign({ discountValue: 20 as unknown as CampaignWithProducts["discountValue"], scope: "GLOBAL" });
    const result = computeFinalPrice(product({ price: 1500 }), [camp]);
    expect(result.finalPrice).toBe(1200);
    expect(result.discountSource).toBe("campaign");
    expect(result.discountPercent).toBe(20);
  });

  it("sabit tutar indirimi doğru uygulanır", () => {
    const camp = campaign({ discountType: "FIXED_AMOUNT", discountValue: 100 as unknown as CampaignWithProducts["discountValue"] });
    const result = computeFinalPrice(product({ price: 1500 }), [camp]);
    expect(result.finalPrice).toBe(1400);
  });

  it("CATEGORY kapsamlı kampanya yalnızca eşleşen kategoriye uygulanır", () => {
    // categorySubtreeIds gerçek sistemde getCurrentlyActiveCampaigns() tarafından
    // kategori ağacından hesaplanır (bkz. category-tree.test.ts); burada tek bir
    // kategori (alt kategorisi olmayan) simüle ediliyor.
    const camp = campaign({ scope: "CATEGORY", categoryId: "cat-1", categorySubtreeIds: ["cat-1"] });
    const matching = computeFinalPrice(product({ categoryId: "cat-1", price: 1000 }), [camp]);
    const nonMatching = computeFinalPrice(product({ categoryId: "cat-2", price: 1000 }), [camp]);
    expect(matching.finalPrice).toBe(800);
    expect(nonMatching.finalPrice).toBe(1000);
  });

  it("CATEGORY kapsamlı kampanya alt kategorilerdeki ürünleri de kapsar (Bölüm 17)", () => {
    // "Bahçe" kategorisi kampanyaya seçilirse, "Bahçe > Dekorasyon > Saksılar"
    // alt ağacındaki bir ürün de kampanyadan yararlanmalı.
    const camp = campaign({ scope: "CATEGORY", categoryId: "bahce", categorySubtreeIds: ["bahce", "dekorasyon", "saksilar"] });
    const result = computeFinalPrice(product({ categoryId: "saksilar", price: 1000 }), [camp]);
    expect(result.finalPrice).toBe(800);
    expect(result.discountSource).toBe("campaign");
  });

  it("PRODUCT kapsamlı kampanya yalnızca CampaignProduct listesindeki ürüne uygulanır", () => {
    const camp = campaign({ scope: "PRODUCT", products: [{ id: "cp1", campaignId: "camp-1", productId: "p1" }] });
    const matching = computeFinalPrice(product({ id: "p1", price: 1000 }), [camp]);
    const nonMatching = computeFinalPrice(product({ id: "p2", price: 1000 }), [camp]);
    expect(matching.finalPrice).toBe(800);
    expect(nonMatching.finalPrice).toBe(1000);
  });

  it("manuel salePrice, kampanyadan daha avantajlıysa o kazanır", () => {
    const camp = campaign({ discountValue: 10 as unknown as CampaignWithProducts["discountValue"] }); // 1000 -> 900
    const result = computeFinalPrice(product({ price: 1000, salePrice: 700 }), [camp]);
    expect(result.finalPrice).toBe(700);
    expect(result.discountSource).toBe("sale");
  });

  it("kampanya salePrice'tan daha avantajlıysa kampanya kazanır (en düşük fiyat kuralı)", () => {
    const camp = campaign({ discountValue: 50 as unknown as CampaignWithProducts["discountValue"] }); // 1000 -> 500
    const result = computeFinalPrice(product({ price: 1000, salePrice: 900 }), [camp]);
    expect(result.finalPrice).toBe(500);
    expect(result.discountSource).toBe("campaign");
  });

  it("final fiyat asla normal fiyatın üzerine çıkmaz", () => {
    const result = computeFinalPrice(product({ price: 1000 }), []);
    expect(result.finalPrice).toBeLessThanOrEqual(result.basePrice);
  });
});

describe("applyBulkAdjustment (Bölüm 16 — toplu fiyat revizyonu)", () => {
  it("yüzde artış doğru hesaplanır", () => {
    expect(applyBulkAdjustment(100, "PERCENT_INCREASE", 10)).toBe(110);
  });
  it("yüzde indirim doğru hesaplanır", () => {
    expect(applyBulkAdjustment(100, "PERCENT_DECREASE", 20)).toBe(80);
  });
  it("sabit artış doğru hesaplanır", () => {
    expect(applyBulkAdjustment(210, "FIXED_INCREASE", 40)).toBe(250);
  });
  it("sabit indirim negatife düşerse 0'da sınırlanır", () => {
    expect(applyBulkAdjustment(50, "FIXED_DECREASE", 100)).toBe(0);
  });
  it("belirli fiyata getir (SET_PRICE) doğrudan hedef değeri döner", () => {
    expect(applyBulkAdjustment(999, "SET_PRICE", 149.9)).toBe(149.9);
  });
  it("SET_PRICE negatif bir değer gönderilirse 0'da sınırlanır", () => {
    expect(applyBulkAdjustment(100, "SET_PRICE", -10)).toBe(0);
  });
  it("yüzde/sabit hesaplamalar kuruş hassasiyetinde (2 ondalık) yuvarlanır", () => {
    expect(applyBulkAdjustment(19.99, "PERCENT_INCREASE", 10)).toBe(21.99);
  });
});
