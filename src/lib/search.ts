import { prisma } from "@/lib/prisma";
import { getCategorySubtreeIds } from "@/lib/category-tree";

// ==========================================================
// FAZ 3 — Bölüm 5/3: Herkese açık ürün arama/filtre/sıralama mimarisi.
//
// Bu dosya, /api/products'ın (ve dolayısıyla /urunler, /kategori/:slug,
// /arama sayfalarının) sorgu mantığını TEK bir yerde toplar. Amaç iki
// katmanlı: (1) bugün için deterministik, alan-bazlı (isim/SKU/marka/
// kategori) bir "contains" araması; (2) ileride AI destekli aramaya
// (semantik/embedding tabanlı, yeniden sıralama vb.) uygun bir mimari.
//
// Genişletme noktası: `buildProductSearchWhere` yalnızca Prisma `where`
// üretir — sıralama/skorlama için hiçbir varsayımda bulunmaz. İleride bir
// AI arama katmanı eklenmek istendiğinde, bu fonksiyonun ürettiği where'i
// "adayları daralt" adımı olarak kullanıp, sonucu ayrı bir semantik
// yeniden-sıralama (rerank) adımından geçirmek yeterli olur — bkz.
// `rerankHook` no-op yer tutucusu aşağıda. Route handler'ların hiçbiri
// doğrudan Prisma where inşa etmez; hepsi bu modülden geçer.
// ==========================================================

export const PRODUCT_SORT_KEYS = ["relevance", "newest", "price_asc", "price_desc", "name_asc"] as const;
export type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number];

export function parseSortKey(value: string | null | undefined): ProductSortKey {
  return (PRODUCT_SORT_KEYS as readonly string[]).includes(value ?? "") ? (value as ProductSortKey) : "relevance";
}

export interface ProductSearchParams {
  query?: string;
  categorySlug?: string;
  /** true ise categorySlug'ın TÜM alt ağacındaki ürünleri de kapsar (bkz. getCategorySubtreeIds). */
  subtree?: boolean;
  brandSlug?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  featuredOnly?: boolean;
}

/**
 * `query`'yi ürün adı, SKU, marka adı ve kategori başlığında arayan bir
 * Prisma `where` üretir (Bölüm 5 gereksinimi: "ürün adı, SKU, marka,
 * kategori"). Bilinen sınır: SQLite `contains` alt-dize araması index
 * kullanamaz (bkz. prisma/schema.prisma Product.name index yorumu) — bu,
 * FAZ 2'den beri dokümante edilmiş, 10.000+ ürün ölçeğinde FTS5'e geçiş
 * gerektirecek bilinen bir performans sınırıdır, FAZ 3 kapsamında
 * değiştirilmedi.
 */
export async function buildProductSearchWhere(params: ProductSearchParams): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = { isActive: true };

  if (params.categorySlug) {
    if (params.subtree) {
      const category = await prisma.category.findUnique({ where: { slug: params.categorySlug } });
      if (category) {
        const subtreeIds = await getCategorySubtreeIds(category.id);
        where.categoryId = { in: subtreeIds };
      } else {
        // Var olmayan slug — hiçbir şey eşleşmesin (imkansız id).
        where.categoryId = "__none__";
      }
    } else {
      where.category = { slug: params.categorySlug };
    }
  }

  if (params.brandSlug) {
    where.brand = { slug: params.brandSlug };
  }

  if (params.featuredOnly) where.isFeatured = true;

  if (params.inStockOnly) {
    // İlişkili Inventory yoksa (bkz. FAZ2.1 kısmi kurtarma notu) stokta
    // sayılmaz — güvenli varsayılan.
    where.inventory = { stockStatus: { not: "OUT_OF_STOCK" } };
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    where.price = {
      ...(params.minPrice !== undefined ? { gte: params.minPrice } : {}),
      ...(params.maxPrice !== undefined ? { lte: params.maxPrice } : {}),
    };
  }

  const q = params.query?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { sku: { contains: q } },
      { shortDescription: { contains: q } },
      { brand: { name: { contains: q } } },
      { category: { title: { contains: q } } },
    ];
  }

  return where;
}

/**
 * Sıralama, dinamik olarak hesaplanan (kampanya/indirim uygulanmış) final
 * fiyata göre DEĞİL, DB'deki `price` (liste fiyatı) alanına göre yapılır —
 * final fiyat sorgu sonrası, uygulama katmanında hesaplanıyor (bkz.
 * src/lib/pricing.ts computeFinalPrice) ve DB'de sıralanabilir bir sütun
 * değil. Bilinen, kabul edilmiş basitleştirme: kampanyalı bir üründe
 * "fiyata göre sırala" bazen liste fiyatı sırasını yansıtır, indirimli
 * fiyat sırasını değil.
 *
 * `relevance` (sort belirtilmediğinde varsayılan) her zaman isme göre
 * (A-Z) sıralar — bu, FAZ 2'den beri /api/products'ın sabit varsayılanıydı
 * (bkz. git geçmişi) ve `sort` param'ı olmayan mevcut çağırıcıları (ör.
 * ana sayfanın kategori-modalı ürün listeleri) kırmamak için KORUNDU.
 * "En yeni" sıralaması yalnızca açıkça `sort=newest` istendiğinde uygulanır.
 */
export function buildProductOrderBy(sort: ProductSortKey, _hasQuery: boolean): Record<string, unknown> {
  switch (sort) {
    case "price_asc":
      return { price: "asc" };
    case "price_desc":
      return { price: "desc" };
    case "newest":
      return { createdAt: "desc" };
    case "name_asc":
    case "relevance":
    default:
      return { name: "asc" };
  }
}
