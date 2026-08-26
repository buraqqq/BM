import { describe, it, expect } from "vitest";
import { parseSortKey, buildProductOrderBy, buildProductSearchWhere } from "@/lib/search";

describe("parseSortKey", () => {
  it("geçerli bir sort değerini olduğu gibi döner", () => {
    expect(parseSortKey("price_asc")).toBe("price_asc");
  });
  it("geçersiz/eksik bir değer için 'relevance'a düşer", () => {
    expect(parseSortKey("boyle-bir-sey-yok")).toBe("relevance");
    expect(parseSortKey(null)).toBe("relevance");
    expect(parseSortKey(undefined)).toBe("relevance");
  });
});

describe("buildProductOrderBy", () => {
  it("relevance (varsayılan, sort param yok) her zaman isme göre A-Z sıralar — mevcut çağırıcıları kırmamak için", () => {
    expect(buildProductOrderBy("relevance", false)).toEqual({ name: "asc" });
    expect(buildProductOrderBy("relevance", true)).toEqual({ name: "asc" });
  });
  it("newest yalnızca açıkça istendiğinde createdAt desc sıralar", () => {
    expect(buildProductOrderBy("newest", false)).toEqual({ createdAt: "desc" });
  });
  it("price_asc / price_desc / name_asc doğru alanı sıralar", () => {
    expect(buildProductOrderBy("price_asc", false)).toEqual({ price: "asc" });
    expect(buildProductOrderBy("price_desc", false)).toEqual({ price: "desc" });
    expect(buildProductOrderBy("name_asc", false)).toEqual({ name: "asc" });
  });
});

// buildProductSearchWhere'in `subtree: true` dalı Prisma'ya (DB) erişir —
// burada yalnızca DB'siz çalışan dallar test ediliyor. subtree davranışı
// canlı sistemde /kategori/:slug üzerinden doğrulandı (bkz. FAZ3 raporu).
describe("buildProductSearchWhere (DB'siz dallar)", () => {
  it("her zaman isActive:true zorunlu kılar", async () => {
    const where = await buildProductSearchWhere({});
    expect(where.isActive).toBe(true);
  });

  it("query'yi ürün adı/SKU/açıklama/marka/kategori üzerinde OR ile arar", async () => {
    const where = await buildProductSearchWhere({ query: "hortum" });
    expect(where.OR).toEqual([
      { name: { contains: "hortum" } },
      { sku: { contains: "hortum" } },
      { shortDescription: { contains: "hortum" } },
      { brand: { name: { contains: "hortum" } } },
      { category: { title: { contains: "hortum" } } },
    ]);
  });

  it("subtree olmadan category filtresi doğrudan slug eşleşmesi kullanır (FAZ2 geriye dönük uyumluluk)", async () => {
    const where = await buildProductSearchWhere({ categorySlug: "baharat" });
    expect(where.category).toEqual({ slug: "baharat" });
    expect(where.categoryId).toBeUndefined();
  });

  it("brand/minPrice/maxPrice/inStock/featured filtrelerini doğru where alanlarına çevirir", async () => {
    const where = await buildProductSearchWhere({
      brandSlug: "acme",
      minPrice: 100,
      maxPrice: 500,
      inStockOnly: true,
      featuredOnly: true,
    });
    expect(where.brand).toEqual({ slug: "acme" });
    expect(where.price).toEqual({ gte: 100, lte: 500 });
    expect(where.inventory).toEqual({ stockStatus: { not: "OUT_OF_STOCK" } });
    expect(where.isFeatured).toBe(true);
  });

  it("hiçbir filtre verilmezse yalnızca isActive:true döner", async () => {
    const where = await buildProductSearchWhere({});
    expect(where).toEqual({ isActive: true });
  });
});
