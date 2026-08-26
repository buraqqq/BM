// ==========================================================
// FAZ 3 — Bölüm 7: schema.org JSON-LD üreticileri.
//
// Saf fonksiyonlar — hiçbir DB/network erişimi yapmaz, yalnızca zaten
// public API'lerden serileştirilmiş veriyi schema.org sözlüğüne çevirir.
// Bu ayrım (veri çekme vs. JSON-LD üretme) birim testini kolaylaştırır.
// ==========================================================
import { absoluteUrl } from "@/lib/seo";
import type { BreadcrumbItem } from "@/lib/breadcrumb";

export interface ProductForJsonLd {
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  shortDescription: string | null;
  images: { url: string }[];
  brand: { name: string } | null;
  price: { final: number };
  inStock: boolean;
}

/**
 * schema.org Product — Google Zengin Sonuçlar (Rich Results) için gerekli
 * asgari alanlar: name, image, offers (price + priceCurrency + availability).
 * Henüz ürün yorumu/puanı (aggregateRating) yok — o alan bilerek eklenmedi
 * (uydurma veri olurdu); gerçek yorum sistemi FAZ 3 kapsamında değil.
 */
export function buildProductJsonLd(product: ProductForJsonLd) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.description ?? product.shortDescription ?? undefined,
    image: product.images.length > 0 ? product.images.map((i) => i.url) : undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    url: absoluteUrl(`/urun/${product.slug}`),
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/urun/${product.slug}`),
      priceCurrency: "TRY",
      price: product.price.final,
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };
}

/** schema.org BreadcrumbList — buildCategoryBreadcrumb/buildProductBreadcrumb çıktısını sarmalar. */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      // Son öğe (mevcut sayfa) için href genelde "#" — schema.org "item"
      // alanı orada anlamsız olduğundan atlanır (Google bunu kabul eder).
      item: item.href !== "#" ? absoluteUrl(item.href) : undefined,
    })),
  };
}
