import { describe, it, expect } from "vitest";
import { buildAffiliateUrl, generateTrackingCode, buildRedirectPath, AFFILIATE_UTM } from "@/lib/affiliate";
import { matchBomToCatalog, type InternalProductRef, type AffiliateRef, type BomItem } from "@/lib/ai-designer-logic";

describe("affiliate — link oluşturma (UTM + takip kodu)", () => {
  it("UTM + ref parametrelerini ekler, mevcut query korunur", () => {
    const url = buildAffiliateUrl("https://www.trendyol.com/sr?q=lavanta", "bmabc123");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("utm_source")).toBe(AFFILIATE_UTM.source);
    expect(parsed.searchParams.get("utm_medium")).toBe("affiliate");
    expect(parsed.searchParams.get("utm_campaign")).toBe("ai-garden-designer");
    expect(parsed.searchParams.get("utm_content")).toBe("bmabc123");
    expect(parsed.searchParams.get("ref")).toBe("bmabc123");
    expect(parsed.searchParams.get("q")).toBe("lavanta");
  });

  it("takip kodu deterministik ve çarpışmasız", () => {
    expect(generateTrackingCode("id-1")).toBe(generateTrackingCode("id-1"));
    expect(generateTrackingCode("id-1")).not.toBe(generateTrackingCode("id-2"));
  });

  it("redirect path üretir", () => {
    expect(buildRedirectPath("abc")).toBe("/api/affiliate/redirect?id=abc");
  });
});

describe("BOM eşleştirme — stok öncelikli internal + en ucuz affiliate", () => {
  const internal: InternalProductRef[] = [
    { id: "p1", name: "Saksı (stokta)", sku: "S1", slug: "s1", price: 100, categorySlug: "saksi", unit: "ADET", stockQuantity: 10 },
    { id: "p2", name: "Saksı (tükenmiş)", sku: "S2", slug: "s2", price: 90, categorySlug: "saksi", unit: "ADET", stockQuantity: 0 },
  ];
  const affiliate: AffiliateRef[] = [
    { id: "a1", name: "Pahalı Saksı", vendor: "X", affiliateUrl: "https://x", category: "saksi", estimatedPrice: 300 },
    { id: "a2", name: "Ucuz Saksı", vendor: "Y", affiliateUrl: "https://y", category: "saksi", estimatedPrice: 150 },
  ];

  it("stokta olan internal seçilir (tükenmiş olan atlanır)", () => {
    const bom: BomItem[] = [{ kind: "saksi", label: "Saksı", quantity: 2, unit: "adet" }];
    const matched = matchBomToCatalog(bom, internal, affiliate);
    expect(matched[0].source).toBe("internal");
    expect(matched[0].productId).toBe("p1");
  });

  it("iç stokta yoksa en ucuz affiliate alternatif seçilir", () => {
    const bom: BomItem[] = [{ kind: "saksi", label: "Saksı", quantity: 2, unit: "adet" }];
    const matched = matchBomToCatalog(bom, [{ ...internal[1] }], affiliate); // yalnızca tükenmiş internal
    expect(matched[0].source).toBe("affiliate");
    expect(matched[0].affiliateProductId).toBe("a2"); // 150 < 300
  });

  it("stok bilgisi olmayan internal kullanılabilir sayılır (geriye uyumluluk)", () => {
    const legacy: InternalProductRef = { id: "p3", name: "Mobilya", sku: "S3", slug: "s3", price: 3000, categorySlug: "sus-esya", unit: "ADET" };
    const bom: BomItem[] = [{ kind: "mobilya", label: "Mobilya", quantity: 1, unit: "set" }];
    const matched = matchBomToCatalog(bom, [legacy], []);
    expect(matched[0].source).toBe("internal");
  });
});
