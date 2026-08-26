import type { Product, Category, Banner, Campaign, Brand } from "@prisma/client";
import { computeFinalPrice, type CampaignWithProducts } from "@/lib/pricing";
import { PRODUCT_UNIT_LABELS, type ProductUnit } from "@/lib/enums";

type ProductWithRelations = Product & {
  category: Category;
  brand?: Brand | null;
  images?: { url: string; altText: string | null; isPrimary: boolean }[];
  inventory?: { quantity: number; stockStatus: string } | null;
};

export function serializePublicProduct(product: ProductWithRelations, activeCampaigns: CampaignWithProducts[]) {
  const breakdown = computeFinalPrice(product, activeCampaigns);
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    category: { id: product.category.id, slug: product.category.slug, title: product.category.title },
    brand: product.brand ? { id: product.brand.id, slug: product.brand.slug, name: product.brand.name } : null,
    shortDescription: product.shortDescription,
    description: product.description,
    unit: product.unit,
    unitLabel: PRODUCT_UNIT_LABELS[product.unit as ProductUnit] ?? product.unit,
    images: product.images?.map((i) => ({ url: i.url, alt: i.altText, isPrimary: i.isPrimary })) ?? [],
    price: {
      base: breakdown.basePrice,
      final: Math.round(breakdown.finalPrice * 100) / 100,
      compareAt: breakdown.compareAtPrice,
      discountSource: breakdown.discountSource,
      discountPercent: breakdown.discountPercent,
      campaign: breakdown.appliedCampaign,
    },
    inStock: (product.inventory?.stockStatus ?? "IN_STOCK") !== "OUT_OF_STOCK",
    isFeatured: product.isFeatured,
  };
}

export function serializeCategory(
  category: Category & { _count?: { products: number }; children?: unknown[] }
) {
  return {
    id: category.id,
    slug: category.slug,
    title: category.title,
    shortDescription: category.shortDescription,
    description: category.description,
    imageUrl: category.imageUrl,
    icon: category.icon,
    color: category.color,
    parentId: category.parentId,
    depth: category.depth,
    path: category.path,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    isFeatured: category.isFeatured,
    seoTitle: category.seoTitle,
    seoDescription: category.seoDescription,
    productCount: category._count?.products ?? undefined,
  };
}

export function serializeBrand(brand: Brand & { _count?: { products: number } }) {
  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    logoUrl: brand.logoUrl,
    description: brand.description,
    website: brand.website,
    isActive: brand.isActive,
    seoTitle: brand.seoTitle,
    seoDescription: brand.seoDescription,
    productCount: brand._count?.products ?? undefined,
  };
}

export function serializeBanner(banner: Banner) {
  return {
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle,
    imageUrl: banner.imageUrl,
    mobileImageUrl: banner.mobileImageUrl,
    ctaText: banner.ctaText,
    ctaLink: banner.ctaLink,
    priority: banner.priority,
  };
}

export function serializeCampaign(campaign: Campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    slug: campaign.slug,
    description: campaign.description,
    discountType: campaign.discountType,
    discountValue: Number(campaign.discountValue),
    scope: campaign.scope,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    bannerText: campaign.bannerText,
    ctaText: campaign.ctaText,
    ctaLink: campaign.ctaLink,
  };
}

// Admin tarafında Decimal alanları JSON'a çevirmek için genel amaçlı yardımcı.
export function decimalToNumber<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): T {
  const copy: Record<string, unknown> = { ...obj };
  for (const f of fields) {
    const v = copy[f as string];
    if (v !== null && v !== undefined) copy[f as string] = Number(v);
  }
  return copy as T;
}
