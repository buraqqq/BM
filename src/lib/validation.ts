import { z } from "zod";
import { CAMPAIGN_DISCOUNT_TYPES, CAMPAIGN_SCOPES, PRODUCT_UNITS } from "@/lib/enums";

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
  subcategoryId: z.string().min(1).optional().nullable(),
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
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  seoTitle: z.string().max(200).optional().nullable(),
  seoDescription: z.string().max(300).optional().nullable(),
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

export const bulkPriceUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  subcategoryId: z.string().min(1).optional(),
  productIds: z.array(z.string().min(1)).optional(),
  adjustment: z.object({
    type: z.enum(["PERCENT_INCREASE", "PERCENT_DECREASE", "FIXED_INCREASE", "FIXED_DECREASE"]),
    value: z.coerce.number().positive().max(1_000_000),
  }),
  dryRun: z.boolean().optional(),
});

export const inventoryUpdateSchema = z.object({
  quantity: z.coerce.number().int(), // pozitif/negatif değişim (delta)
  type: z.enum(["RESTOCK", "SALE", "ADJUSTMENT", "MIGRATION"]),
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
    subcategoryId: z.string().min(1).optional().nullable(),
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
  .refine((data) => data.scope !== "SUBCATEGORY" || !!data.subcategoryId, {
    message: "SUBCATEGORY kapsamı için subcategoryId zorunlu",
    path: ["subcategoryId"],
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

export const categoryCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  shortDescription: z.string().max(500).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});
