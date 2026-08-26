import { describe, it, expect } from "vitest";
import { toScored, compareScored, mergeSortedScored, type ScoredId } from "@/lib/price-sort";
import type { CampaignWithProducts } from "@/lib/pricing";

// FAZ 3.1 — Bölüm 1/3: "Fiyat: düşükten yükseğe/yüksekten düşüğe" sıralamasının
// GERÇEK satış (final) fiyatına göre yapıldığını doğrulayan testler.
//
// `toScored`/`compareScored`/`mergeSortedScored` DB'ye dokunmayan saf
// fonksiyonlardır (bkz. src/lib/price-sort.ts) — computeFinalPrice'ı
// (src/lib/pricing.ts, TEK doğruluk kaynağı) doğrudan çağırırlar. Bu
// testler, gerçek /api/products?sort=price_asc yolunun ÜRETTİĞİ sırayı
// birebir üreten aynı kod yolunu (getFinalPriceSortedPage'in kendisinin
// kullandığı fonksiyonlar) egzersiz eder — Prisma mock'lamaya gerek yok.
// DB'ye karşı uçtan uca doğrulama ayrıca canlı sistemde yapıldı (bkz.
// FAZ3.1 raporu Bölüm 10).

function campaign(overrides: Partial<CampaignWithProducts> = {}): CampaignWithProducts {
  return {
    id: "camp-1",
    name: "Test Kampanya",
    slug: "test-kampanya",
    description: null,
    discountType: "PERCENTAGE",
    discountValue: 30 as unknown as CampaignWithProducts["discountValue"],
    scope: "PRODUCT",
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
    name: "Ürün",
    categoryId: "cat-1",
    price: 1000 as unknown as number,
    compareAtPrice: null,
    salePrice: null,
    ...overrides,
  } as never;
}

function sortAll(products: ReturnType<typeof product>[], campaigns: CampaignWithProducts[], direction: "asc" | "desc"): ScoredId[] {
  return products.map((p) => toScored(p, campaigns)).sort((a, b) => compareScored(a, b, direction));
}

describe("Test 1 — normal (kampanyasız) fiyat sıralaması", () => {
  it("düşükten yükseğe listedeki fiyatlara göre sıralar", () => {
    const products = [product({ id: "a", name: "A", price: 300 }), product({ id: "b", name: "B", price: 100 }), product({ id: "c", name: "C", price: 200 })];
    const sorted = sortAll(products, [], "asc");
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
});

describe("Test 2 — indirimli ürün, indirimsiz üründen ucuzsa doğru sırada gelir", () => {
  it("Product A (1000 TL, %30 kampanya -> 700 TL) Product B'den (750 TL, kampanyasız) önce gelir", () => {
    // Sorunun kendi örneği: A liste 1000, %30 kampanya -> 700; B liste 750, kampanyasız -> 750.
    const camp = campaign({ scope: "PRODUCT", discountValue: 30 as unknown as CampaignWithProducts["discountValue"], products: [{ id: "cp1", campaignId: "camp-1", productId: "a" }] });
    const products = [product({ id: "a", name: "Product A", price: 1000 }), product({ id: "b", name: "Product B", price: 750 })];
    const sorted = sortAll(products, [camp], "asc");
    expect(sorted.map((s) => ({ id: s.id, finalPrice: s.finalPrice }))).toEqual([
      { id: "a", finalPrice: 700 },
      { id: "b", finalPrice: 750 },
    ]);
  });
});

describe("Test 3 — iki farklı kampanyalı ürün", () => {
  it("her ürün kendi kampanyasının indirimiyle doğru sıralanır", () => {
    const camp1 = campaign({ id: "c1", scope: "PRODUCT", discountType: "PERCENTAGE", discountValue: 50 as unknown as CampaignWithProducts["discountValue"], products: [{ id: "cp1", campaignId: "c1", productId: "a" }] });
    const camp2 = campaign({ id: "c2", scope: "PRODUCT", discountType: "FIXED_AMOUNT", discountValue: 100 as unknown as CampaignWithProducts["discountValue"], products: [{ id: "cp2", campaignId: "c2", productId: "b" }] });
    // a: 1000 * (1-0.5) = 500 ; b: 400 - 100 = 300
    const products = [product({ id: "a", name: "A", price: 1000 }), product({ id: "b", name: "B", price: 400 })];
    const sorted = sortAll(products, [camp1, camp2], "asc");
    expect(sorted.map((s) => s.id)).toEqual(["b", "a"]); // 300 < 500
    expect(sorted.map((s) => s.finalPrice)).toEqual([300, 500]);
  });
});

describe("Test 4 — kampanyası bitmiş ürün", () => {
  it("süresi dolmuş bir kampanya activeCampaigns listesine hiç girmez (getCurrentlyActiveCampaigns sorumluluğu) — final fiyat liste fiyatına eşit kalır", () => {
    // Süresi dolmuş kampanyalar zaten getCurrentlyActiveCampaigns() tarafından
    // hiç döndürülmez (bkz. src/lib/pricing.ts, WHERE endDate >= now) — bu
    // yüzden burada "boş activeCampaigns" ile simüle ediliyor: sistemin gerçek
    // davranışı budur, tarih filtresi burada YENİDEN yazılmadı.
    const products = [product({ id: "a", name: "A", price: 900 }), product({ id: "b", name: "B", price: 100 })];
    const sorted = sortAll(products, [], "asc"); // bitmiş kampanya -> aktif kampanya listesinde yok
    expect(sorted.map((s) => s.finalPrice)).toEqual([100, 900]);
  });
});

describe("Test 5 — kampanyası henüz başlamamış ürün", () => {
  it("başlamamış bir kampanya da activeCampaigns listesine hiç girmez — final fiyat liste fiyatına eşit kalır", () => {
    const products = [product({ id: "a", name: "A", price: 900 }), product({ id: "b", name: "B", price: 100 })];
    const sorted = sortAll(products, [], "asc"); // başlamamış kampanya -> aktif kampanya listesinde yok
    expect(sorted.map((s) => s.finalPrice)).toEqual([100, 900]);
  });
});

describe("Test 6 — manuel salePrice varsa doğru final fiyatla sıralanır", () => {
  it("salePrice, aktif kampanyadan daha avantajlıysa salePrice kazanır ve sıralama ona göre olur", () => {
    const camp = campaign({ scope: "GLOBAL", discountValue: 10 as unknown as CampaignWithProducts["discountValue"] }); // 1000 -> 900
    const products = [
      product({ id: "a", name: "A", price: 1000, salePrice: 400 }), // salePrice kazanır: 400
      product({ id: "b", name: "B", price: 500 }), // kampanya: 450
    ];
    const sorted = sortAll(products, [camp], "asc");
    expect(sorted.map((s) => ({ id: s.id, finalPrice: s.finalPrice }))).toEqual([
      { id: "a", finalPrice: 400 },
      { id: "b", finalPrice: 450 },
    ]);
  });
});

describe("Test 7 — fiyatı eşit ürünler için deterministik ikincil sıralama", () => {
  it("final fiyatları eşit olan ürünler isme göre (A-Z) sıralanır, yön ne olursa olsun", () => {
    const products = [product({ id: "z", name: "Zebra Ürün", price: 500 }), product({ id: "a", name: "Alpha Ürün", price: 500 }), product({ id: "m", name: "Mango Ürün", price: 500 })];
    const asc = sortAll(products, [], "asc");
    expect(asc.map((s) => s.name)).toEqual(["Alpha Ürün", "Mango Ürün", "Zebra Ürün"]);
    // Yüksekten düşüğe sıralamada da FİYAT eşitse ikincil anahtar (isim A-Z) sabit kalır.
    const desc = sortAll(products, [], "desc");
    expect(desc.map((s) => s.name)).toEqual(["Alpha Ürün", "Mango Ürün", "Zebra Ürün"]);
  });

  it("aynı isim+fiyata sahip iki farklı üründe bile sıralama çökmeden, kararlı bir sonuç üretir", () => {
    const products = [product({ id: "y", name: "Aynı", price: 100 }), product({ id: "x", name: "Aynı", price: 100 })];
    const sorted = sortAll(products, [], "asc");
    expect(sorted.map((s) => s.finalPrice)).toEqual([100, 100]);
    expect(sorted).toHaveLength(2);
  });
});

describe("mergeSortedScored (price-sort.ts'in DB'siz bölünmüş-sayfalama merge algoritması)", () => {
  it("iki sıralı diziyi doğru şekilde tek sıralı diziye birleştirir (asc)", () => {
    const a: ScoredId[] = [{ id: "a1", name: "A1", finalPrice: 100 }, { id: "a2", name: "A2", finalPrice: 400 }];
    const b: ScoredId[] = [{ id: "b1", name: "B1", finalPrice: 200 }, { id: "b2", name: "B2", finalPrice: 300 }];
    const merged = mergeSortedScored(a, b, "asc");
    expect(merged.map((m) => m.finalPrice)).toEqual([100, 200, 300, 400]);
    expect(merged.map((m) => m.id)).toEqual(["a1", "b1", "b2", "a2"]);
  });

  it("desc yönünde de doğru birleştirir", () => {
    const a: ScoredId[] = [{ id: "a1", name: "A1", finalPrice: 400 }, { id: "a2", name: "A2", finalPrice: 100 }];
    const b: ScoredId[] = [{ id: "b1", name: "B1", finalPrice: 300 }, { id: "b2", name: "B2", finalPrice: 200 }];
    const merged = mergeSortedScored(a, b, "desc");
    expect(merged.map((m) => m.finalPrice)).toEqual([400, 300, 200, 100]);
  });

  it("boş bir diziyle birleştirme diğer diziyi olduğu gibi döner", () => {
    const a: ScoredId[] = [{ id: "a1", name: "A1", finalPrice: 50 }];
    expect(mergeSortedScored(a, [], "asc")).toEqual(a);
    expect(mergeSortedScored([], a, "asc")).toEqual(a);
  });
});
