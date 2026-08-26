import { describe, it, expect } from "vitest";
import { buildProductJsonLd, buildBreadcrumbJsonLd } from "@/lib/structured-data";

describe("buildProductJsonLd", () => {
  it("schema.org Product için asgari gerekli alanları üretir (Google Zengin Sonuçlar)", () => {
    const jsonLd = buildProductJsonLd({
      name: "Yeşil Hortum 25m",
      slug: "yesil-hortum-25m",
      sku: "BM-SULAMA-001",
      description: "Bahçe sulama hortumu",
      shortDescription: null,
      images: [{ url: "https://cdn.example.com/hortum.jpg" }],
      brand: { name: "Acme" },
      price: { final: 249.9 },
      inStock: true,
    });

    expect(jsonLd["@type"]).toBe("Product");
    expect(jsonLd.name).toBe("Yeşil Hortum 25m");
    expect(jsonLd.sku).toBe("BM-SULAMA-001");
    expect(jsonLd.brand).toEqual({ "@type": "Brand", name: "Acme" });
    expect(jsonLd.image).toEqual(["https://cdn.example.com/hortum.jpg"]);
    expect(jsonLd.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "TRY",
      price: 249.9,
      availability: "https://schema.org/InStock",
    });
  });

  it("stokta yokken availability OutOfStock döner", () => {
    const jsonLd = buildProductJsonLd({
      name: "Tükenen Ürün",
      slug: "tukenen-urun",
      sku: "BM-X-001",
      description: null,
      shortDescription: null,
      images: [],
      brand: null,
      price: { final: 10 },
      inStock: false,
    });
    expect(jsonLd.offers.availability).toBe("https://schema.org/OutOfStock");
    expect(jsonLd.image).toBeUndefined();
    expect(jsonLd.brand).toBeUndefined();
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("her öğeye 1'den başlayan sıralı position atar", () => {
    const jsonLd = buildBreadcrumbJsonLd([
      { label: "Ana Sayfa", href: "/" },
      { label: "Bahçe", href: "/kategori/bahce" },
      { label: "Hortum", href: "#" },
    ]);
    expect(jsonLd["@type"]).toBe("BreadcrumbList");
    expect(jsonLd.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(jsonLd.itemListElement[2].item).toBeUndefined(); // href "#" -> item atlanır
    expect(jsonLd.itemListElement[1].item).toContain("/kategori/bahce");
  });
});
