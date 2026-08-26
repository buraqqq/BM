import { describe, it, expect } from "vitest";
import { buildPageHref, getPageWindow } from "@/lib/pagination";

describe("buildPageHref", () => {
  it("sayfa 1 için query'e page eklemez (temiz URL)", () => {
    expect(buildPageHref("/urunler", {}, 1)).toBe("/urunler");
  });

  it("sayfa > 1 için page parametresi ekler", () => {
    expect(buildPageHref("/urunler", {}, 3)).toBe("/urunler?page=3");
  });

  it("diğer filtreleri korur, yalnızca page'i değiştirir", () => {
    const href = buildPageHref("/kategori/baharat", { brand: "acme", sort: "price_asc", page: "5" }, 2);
    expect(href).toBe("/kategori/baharat?brand=acme&sort=price_asc&page=2");
  });

  it("boş/undefined değerleri query'e dahil etmez", () => {
    const href = buildPageHref("/arama", { q: "hortum", brand: undefined, minPrice: "" }, 1);
    expect(href).toBe("/arama?q=hortum");
  });
});

describe("getPageWindow", () => {
  it("tüm sayfalar 5'ten azsa hepsini elipsis'siz döner", () => {
    expect(getPageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("ortadaki bir sayfa için hem baş hem son elipsis içerir", () => {
    // total=20, current=10, siblingCount=2 -> [1, ..., 8,9,10,11,12, ..., 20]
    expect(getPageWindow(10, 20)).toEqual([1, "...", 8, 9, 10, 11, 12, "...", 20]);
  });

  it("ilk sayfadayken yalnızca sondaki elipsis görünür", () => {
    expect(getPageWindow(1, 20)).toEqual([1, 2, 3, "...", 20]);
  });

  it("son sayfadayken yalnızca baştaki elipsis görünür", () => {
    expect(getPageWindow(20, 20)).toEqual([1, "...", 18, 19, 20]);
  });

  it("total 0 olduğunda tek sayfa [1] döner (bölme hatası vermez)", () => {
    expect(getPageWindow(1, 0)).toEqual([1]);
  });
});
