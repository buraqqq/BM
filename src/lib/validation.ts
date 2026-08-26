import { z } from "zod";
import {
  CAMPAIGN_DISCOUNT_TYPES,
  CAMPAIGN_SCOPES,
  PRODUCT_UNITS,
  PRODUCT_ATTRIBUTE_TYPES,
  BULK_PRODUCT_ACTIONS,
  INVENTORY_MOVEMENT_TYPES,
} from "@/lib/enums";

// ==========================================================
// Bölüm 18/21/22 — API validation.
// Frontend'den (admin panel dahil) gelen HİÇBİR veri doğrudan
// güvenilmez; her admin write-endpoint'i burada tanımlı bir zod
// şemasıyla parse edilir. Geçersiz veri 400 ile reddedilir.
// ==========================================================

export const productCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  sku: z.string().trim().min(2).max(64).optional(), // boşsa otomatik üretilir
  barcode: z.string().trim().max(64).optional().nullable(),
  categoryId: z.string().min(1),
  brandId: z.string().min(1).optional().nullable(),
  shortDescription: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  price: z.coerce.number().positive().max(10_000_000),
  compareAtPrice: z.coerce.number().nonnegative().max(10_000_000).optional().nullable(),
  salePrice: z.coerce.number().nonnegative().max(10_000_000).optional().nullable(),
  costPrice: z.coerce.number().nonnegative().max(10_000_000).optional().nullable(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  unit: z.enum(PRODUCT_UNITS).optional(),
  weight: z.coerce.number().nonnegative().optional().nullable(),
  stock: z.coerce.number().int().min(0).optional(),
  minimumStock: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  seoTitle: z.string().max(200).optional().nullable(),
  seoDescription: z.string().max(300).optional().nullable(),
  // Bölüm 10 — dinamik özellikler: [{ attributeDefinitionId, value }]
  attributes: z.array(z.object({ attributeDefinitionId: z.string().min(1), value: z.string().max(500) })).optional(),
});

export const productUpdateSchema = productCreateSchema.partial();

export const productArchiveSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().max(300).optional(),
});

export const priceUpdateSchema = z.object({
  price: z.coerce.number().positive().max(10_000_000).optional(),
  compareAtPrice: z.coerce.number().nonnegative().max(10_000_000).optional().nullable(),
  salePrice: z.coerce.number().nonnegative().max(10_000_000).optional().nullable(),
  reason: z.string().max(300).optional(),
});

// Bölüm 13 — Toplu fiyat motoru kapsamı: tüm ürünler / kategori (+ alt
// kategorileri) / marka / seçili ürünler. En az bir kapsam alanı gerekir
// (route içinde kontrol edilir) — hiçbiri verilmezse "tüm ürünler" anlamına
// GELMEZ, kazara toplu işlem riskini önlemek için explicit "allProducts:true" gerekir.
export const bulkPriceUpdateSchema = z.object({
  allProducts: z.boolean().optional(),
  categoryId: z.string().min(1).optional(), // kategori + tüm alt kategorileri
  brandId: z.string().min(1).optional(),
  productIds: z.array(z.string().min(1)).optional(),
  adjustment: z.object({
    type: z.enum(["PERCENT_INCREASE", "PERCENT_DECREASE", "FIXED_INCREASE", "FIXED_DECREASE", "SET_PRICE"]),
    value: z.coerce.number().nonnegative().max(10_000_000),
  }),
  dryRun: z.boolean().optional(),
});

export const inventoryUpdateSchema = z.object({
  quantity: z.coerce.number().int(), // pozitif/negatif değişim (delta)
  type: z.enum(INVENTORY_MOVEMENT_TYPES),
  reason: z.string().max(300).optional(),
});

// Bölüm 20 — Stok Sayım Modu: sistem stoğu ile fiziksel sayım arasındaki
// farkı COUNT_ADJUSTMENT hareketi olarak uygular.
export const inventoryCountSchema = z.object({
  countedQuantity: z.coerce.number().int().min(0),
  reason: z.string().max(300).optional(),
});

export const campaignCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: z.string().max(1000).optional().nullable(),
    discountType: z.enum(CAMPAIGN_DISCOUNT_TYPES),
    discountValue: z.coerce.number().positive().max(1_000_000),
    scope: z.enum(CAMPAIGN_SCOPES),
    categoryId: z.string().min(1).optional().nullable(),
    productIds: z.array(z.string().min(1)).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    bannerText: z.string().max(200).optional().nullable(),
    ctaText: z.string().max(100).optional().nullable(),
    ctaLink: z.string().max(500).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "Bitiş tarihi başlangıç tarihinden sonra olmalı",
    path: ["endDate"],
  })
  .refine((data) => data.discountType !== "PERCENTAGE" || data.discountValue <= 100, {
    message: "Yüzde indirim 100'ü aşamaz",
    path: ["discountValue"],
  })
  .refine((data) => data.scope !== "CATEGORY" || !!data.categoryId, {
    message: "CATEGORY kapsamı için categoryId zorunlu",
    path: ["categoryId"],
  })
  .refine((data) => data.scope !== "PRODUCT" || (data.productIds && data.productIds.length > 0), {
    message: "PRODUCT kapsamı için en az bir productId zorunlu",
    path: ["productIds"],
  });

export const campaignUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  discountType: z.enum(CAMPAIGN_DISCOUNT_TYPES).optional(),
  discountValue: z.coerce.number().positive().max(1_000_000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  bannerText: z.string().max(200).optional().nullable(),
  ctaText: z.string().max(100).optional().nullable(),
  ctaLink: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const bannerCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    subtitle: z.string().max(300).optional().nullable(),
    imageUrl: z.string().min(1).max(1000),
    mobileImageUrl: z.string().max(1000).optional().nullable(),
    ctaText: z.string().max(100).optional().nullable(),
    ctaLink: z.string().max(500).optional().nullable(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    priority: z.coerce.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
    targetCategoryId: z.string().min(1).optional().nullable(),
    targetProductId: z.string().min(1).optional().nullable(),
    targetCampaignId: z.string().min(1).optional().nullable(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "Bitiş tarihi başlangıç tarihinden sonra olmalı",
    path: ["endDate"],
  });

export const bannerUpdateSchema = bannerCreateSchema.innerType().partial();

// Bölüm 3/5 — profesyonel kategori sistemi: hiyerarşi (parentId), açıklama,
// görsel, sıralama, aktif/pasif, featured, SEO.
export const categoryCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  parentId: z.string().min(1).optional().nullable(),
  shortDescription: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  imageUrl: z.string().max(1000).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  seoTitle: z.string().max(200).optional().nullable(),
  seoDescription: z.string().max(300).optional().nullable(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

// Kategori taşıma (parent değiştirme) — ayrı, dar kapsamlı bir uç, yanlışlıkla
// diğer alanların ezilmesini önler.
export const categoryMoveSchema = z.object({
  parentId: z.string().min(1).nullable(),
});

export const categoryArchiveSchema = z.object({
  isActive: z.boolean(),
});

// Bölüm 6 — Marka yönetimi
export const brandCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  logoUrl: z.string().max(1000).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  seoTitle: z.string().max(200).optional().nullable(),
  seoDescription: z.string().max(300).optional().nullable(),
});

export const brandUpdateSchema = brandCreateSchema.partial();

// Bölüm 10 — Esnek ürün özellik tanımları
export const attributeDefinitionCreateSchema = z.object({
  categoryId: z.string().min(1).optional().nullable(), // null = tüm kategorilerde
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "key yalnızca küçük harf, rakam ve alt çizgi içerebilir"),
  name: z.string().trim().min(1).max(200),
  type: z.enum(PRODUCT_ATTRIBUTE_TYPES).optional(),
  unit: z.string().max(20).optional().nullable(),
  options: z.array(z.string().max(200)).optional(), // yalnızca type=SELECT için anlamlı
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const attributeDefinitionUpdateSchema = attributeDefinitionCreateSchema.partial();

// Bölüm 22 — Ürün toplu işlemleri
export const bulkProductActionSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1),
  action: z.enum(BULK_PRODUCT_ACTIONS),
  categoryId: z.string().min(1).optional(), // SET_CATEGORY için
  brandId: z.string().min(1).optional().nullable(), // SET_BRAND için
  campaignId: z.string().min(1).optional(), // ADD_TO_CAMPAIGN / REMOVE_FROM_CAMPAIGN için
});

// Bölüm 23/24 — CSV/Excel import
export const importPreviewSchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1).max(20_000),
  columnMapping: z.record(z.string(), z.string()), // { "Ürün Adı": "name", ... }
});

export const importCommitSchema = importPreviewSchema.extend({
  fileName: z.string().max(300).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});
