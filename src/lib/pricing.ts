import { prisma } from "@/lib/prisma";
import type { Campaign, CampaignProduct, Product } from "@prisma/client";

// ==========================================================
// Bölüm 11 — Price Engine
// Bölüm 12 — Kampanya sistemi (tarih bazlı otomatik aktiflik)
//
// Tasarım kararı: Kampanyalar için ayrı bir cron/scheduler KURULMADI.
// Bunun yerine "aktiflik" her okuma anında türetilir (derived):
//   isCurrentlyActive = campaign.isActive AND startDate <= now <= endDate
// Bu, FAZ 1 ölçeğinde (küçük işletme, düşük trafik) cron altyapısı
// kurmaktan daha basit ve daha az hataya açık; "otomatik başlangıç/bitiş"
// gereksinimini tam olarak karşılar çünkü her istek anlık, güncel duruma
// göre hesaplanır. Bkz. docs/architecture.md.
// ==========================================================

export type CampaignWithProducts = Campaign & { products: CampaignProduct[] };

export async function getCurrentlyActiveCampaigns(): Promise<CampaignWithProducts[]> {
  const now = new Date();
  return prisma.campaign.findMany({
    where: {
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: { products: true },
  });
}

export interface PriceBreakdown {
  basePrice: number;
  finalPrice: number;
  compareAtPrice: number | null;
  discountSource: "campaign" | "sale" | "none";
  appliedCampaign: { id: string; name: string; discountType: string; discountValue: number } | null;
  discountPercent: number | null;
}

function applyCampaignDiscount(basePrice: number, campaign: Campaign): number {
  const value = Number(campaign.discountValue);
  if (campaign.discountType === "PERCENTAGE") {
    const pct = Math.min(Math.max(value, 0), 100);
    return Math.max(basePrice * (1 - pct / 100), 0);
  }
  // FIXED_AMOUNT
  return Math.max(basePrice - value, 0);
}

function campaignAppliesToProduct(
  campaign: CampaignWithProducts,
  product: Pick<Product, "id" | "categoryId" | "subcategoryId">
): boolean {
  switch (campaign.scope) {
    case "GLOBAL":
      return true;
    case "CATEGORY":
      return campaign.categoryId === product.categoryId;
    case "SUBCATEGORY":
      return campaign.subcategoryId !== null && campaign.subcategoryId === product.subcategoryId;
    case "PRODUCT":
      return campaign.products.some((cp) => cp.productId === product.id);
    default:
      return false;
  }
}

/**
 * Verilen ürün için, halihazırda aktif kampanyalar arasından en avantajlı
 * (müşteri için en düşük final fiyatı veren) sonucu hesaplar. Manuel
 * salePrice ile karşılaştırılıp ikisinden düşük olanı final fiyat olarak
 * döner — hiçbir durumda normal (price) alanının üzerine çıkmaz.
 */
export function computeFinalPrice(
  product: Pick<Product, "id" | "categoryId" | "subcategoryId" | "price" | "compareAtPrice" | "salePrice">,
  activeCampaigns: CampaignWithProducts[]
): PriceBreakdown {
  const basePrice = Number(product.price);
  let best: PriceBreakdown = {
    basePrice,
    finalPrice: basePrice,
    compareAtPrice: product.compareAtPrice !== null ? Number(product.compareAtPrice) : null,
    discountSource: "none",
    appliedCampaign: null,
    discountPercent: null,
  };

  if (product.salePrice !== null && Number(product.salePrice) < best.finalPrice) {
    const sp = Number(product.salePrice);
    best = {
      basePrice,
      finalPrice: sp,
      compareAtPrice: best.compareAtPrice ?? basePrice,
      discountSource: "sale",
      appliedCampaign: null,
      discountPercent: Math.round((1 - sp / basePrice) * 100),
    };
  }

  for (const campaign of activeCampaigns) {
    if (!campaignAppliesToProduct(campaign, product)) continue;
    const candidate = applyCampaignDiscount(basePrice, campaign);
    if (candidate < best.finalPrice) {
      best = {
        basePrice,
        finalPrice: candidate,
        compareAtPrice: best.compareAtPrice ?? basePrice,
        discountSource: "campaign",
        appliedCampaign: {
          id: campaign.id,
          name: campaign.name,
          discountType: campaign.discountType,
          discountValue: Number(campaign.discountValue),
        },
        discountPercent: Math.round((1 - candidate / basePrice) * 100),
      };
    }
  }

  return best;
}

/**
 * Bölüm 16 — Toplu fiyat revizyonu için servis altyapısı.
 * UI'ı bu fazda tam olarak yapılmadı (bkz. docs/admin.md), ancak servis
 * ve API endpoint'i çalışır durumda ve test edilmiştir.
 */
export type BulkAdjustmentType = "PERCENT_INCREASE" | "PERCENT_DECREASE" | "FIXED_INCREASE" | "FIXED_DECREASE";

export function applyBulkAdjustment(currentPrice: number, type: BulkAdjustmentType, value: number): number {
  switch (type) {
    case "PERCENT_INCREASE":
      return Math.round(currentPrice * (1 + value / 100) * 100) / 100;
    case "PERCENT_DECREASE":
      return Math.round(currentPrice * (1 - value / 100) * 100) / 100;
    case "FIXED_INCREASE":
      return Math.round((currentPrice + value) * 100) / 100;
    case "FIXED_DECREASE":
      return Math.max(0, Math.round((currentPrice - value) * 100) / 100);
    default:
      return currentPrice;
  }
}
