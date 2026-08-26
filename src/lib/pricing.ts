import { prisma } from "@/lib/prisma";
import type { Campaign, CampaignProduct, Product } from "@prisma/client";
import { getCategorySubtreeIds } from "@/lib/category-tree";

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

// FAZ 2 — Bölüm 3/17: kategoriler artık ağaç yapısında. Bir CATEGORY kapsamlı
// kampanya, seçilen kategori VE tüm alt kategorilerindeki ürünleri kapsar.
// categorySubtreeIds bu eşleşmeyi O(1) Set lookup'a indirger (her istekte
// ağacı yeniden dolaşmak yerine, kampanya başına bir kez hesaplanır).
export type CampaignWithProducts = Campaign & {
  products: CampaignProduct[];
  categorySubtreeIds?: string[];
};

export async function getCurrentlyActiveCampaigns(): Promise<CampaignWithProducts[]> {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: { products: true },
  });

  return Promise.all(
    campaigns.map(async (c) => ({
      ...c,
      categorySubtreeIds: c.scope === "CATEGORY" && c.categoryId ? await getCategorySubtreeIds(c.categoryId) : undefined,
    }))
  );
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

function campaignAppliesToProduct(campaign: CampaignWithProducts, product: Pick<Product, "id" | "categoryId">): boolean {
  switch (campaign.scope) {
    case "GLOBAL":
      return true;
    case "CATEGORY":
      // Bölüm 17: kategori kapsamı, seçilen kategori + tüm alt kategorilerini kapsar.
      return !!campaign.categorySubtreeIds?.includes(product.categoryId);
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
  product: Pick<Product, "id" | "categoryId" | "price" | "compareAtPrice" | "salePrice">,
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

// ==========================================================
// Bölüm 17 — Kampanya çakışma açıklaması
// Bir ürün aynı anda birden fazla kampanyanın kapsamına girebilir (global +
// kategori + ürün-özel). computeFinalPrice sessizce "en düşük fiyat kazanır"
// kuralını uygular; explainPriceDecision ise admin panelinde "hangisi
// kazandı, neden, diğerleri neden kaybetti" sorusunu açıkça yanıtlamak için
// TÜM uygulanabilir kampanyaları, her birinin ürettiği fiyatı ve kazanıp
// kazanmadığını listeler. Aynı ürün için asla belirsiz/iki farklı fiyat
// üretilmez — kazanan her zaman computeFinalPrice ile birebir aynı sonuçtur.
// ==========================================================
export interface PriceDecisionCandidate {
  source: "sale" | "campaign";
  label: string;
  campaignId: string | null;
  scope: string | null;
  resultingPrice: number;
  isWinner: boolean;
}

export interface PriceDecisionExplanation {
  basePrice: number;
  winner: PriceBreakdown;
  candidates: PriceDecisionCandidate[];
}

export function explainPriceDecision(
  product: Pick<Product, "id" | "categoryId" | "price" | "compareAtPrice" | "salePrice">,
  activeCampaigns: CampaignWithProducts[]
): PriceDecisionExplanation {
  const basePrice = Number(product.price);
  const winner = computeFinalPrice(product, activeCampaigns);
  const candidates: PriceDecisionCandidate[] = [];

  if (product.salePrice !== null) {
    const sp = Number(product.salePrice);
    candidates.push({
      source: "sale",
      label: "Manuel indirimli fiyat (salePrice)",
      campaignId: null,
      scope: null,
      resultingPrice: sp,
      isWinner: winner.discountSource === "sale",
    });
  }

  for (const campaign of activeCampaigns) {
    if (!campaignAppliesToProduct(campaign, product)) continue;
    const candidate = applyCampaignDiscount(basePrice, campaign);
    candidates.push({
      source: "campaign",
      label: campaign.name,
      campaignId: campaign.id,
      scope: campaign.scope,
      resultingPrice: candidate,
      isWinner: winner.discountSource === "campaign" && winner.appliedCampaign?.id === campaign.id,
    });
  }

  candidates.sort((a, b) => a.resultingPrice - b.resultingPrice);
  return { basePrice, winner, candidates };
}

/**
 * Bölüm 16 — Toplu fiyat revizyonu için servis altyapısı.
 * UI'ı bu fazda tam olarak yapılmadı (bkz. docs/admin.md), ancak servis
 * ve API endpoint'i çalışır durumda ve test edilmiştir.
 */
export type BulkAdjustmentType =
  | "PERCENT_INCREASE"
  | "PERCENT_DECREASE"
  | "FIXED_INCREASE"
  | "FIXED_DECREASE"
  | "SET_PRICE"; // FAZ 2 Bölüm 13 — "belirli fiyata getir"

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
    case "SET_PRICE":
      return Math.max(0, Math.round(value * 100) / 100);
    default:
      return currentPrice;
  }
}
