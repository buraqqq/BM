import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("Türkçe karakterleri doğru dönüştürür", () => {
    expect(slugify("Çörek Otu")).toBe("corek-otu");
    expect(slugify("Şişe Açacağı")).toBe("sise-acacagi");
    expect(slugify("Güneşlik Şemsiye")).toBe("guneslik-semsiye");
  });

  it("özel karakterleri tire ile değiştirir", () => {
    expect(slugify("B&M Mangal Baharı (İmza)")).toBe("b-m-mangal-bahari-imza");
  });

  it("baştaki/sondaki tireleri temizler", () => {
    expect(slugify("--Test--")).toBe("test");
  });
});

describe("uniqueSlug", () => {
  it("çakışma yoksa temel slug'ı döner", async () => {
    const result = await uniqueSlug("Yeni Ürün", async () => false);
    expect(result).toBe("yeni-urun");
  });

  it("çakışma varsa sayı ekleyerek benzersizleştirir", async () => {
    const existing = new Set(["yeni-urun", "yeni-urun-2"]);
    const result = await uniqueSlug("Yeni Ürün", async (c) => existing.has(c));
    expect(result).toBe("yeni-urun-3");
  });
});
