import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getInventorySummary } from "@/lib/inventory-summary";
import { isCurrentlyActiveByDateRange } from "@/lib/date-range-active";

export const dynamic = "force-dynamic";

/**
 * Bölüm 38/45 — Katalog Operasyon Merkezi Dashboard'u.
 * TÜM sayılar canlı DB sorgularından hesaplanır — hiçbiri sabit/örnek veri
 * değildir. "unverifiedInventoryCount > 0" her zaman gösterilen, gizlenemez
 * bir uyarıdır (Bölüm 45: legacy stokların gerçek sayım olmadan "doğru"
 * ilan edilmemesi gerektiği).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const now = new Date();

  const [
    totalProducts,
    activeProducts,
    inactiveProducts,
    inventorySummary,
    campaigns,
    activeBannersRaw,
    totalCategories,
    totalBrands,
    pendingImportJobs,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: false } }),
    getInventorySummary(),
    prisma.campaign.findMany({ select: { isActive: true, startDate: true, endDate: true } }),
    prisma.banner.findMany({ select: { isActive: true, startDate: true, endDate: true } }),
    prisma.category.count({ where: { isActive: true } }),
    prisma.brand.count({ where: { isActive: true } }),
    prisma.importJob.count({ where: { status: { in: ["PENDING", "VALIDATED", "IMPORTING"] } } }),
  ]);

  const activeCampaignsCount = campaigns.filter((c) => isCurrentlyActiveByDateRange(now, c.startDate, c.endDate, c.isActive)).length;
  const plannedCampaignsCount = campaigns.filter((c) => c.isActive && c.startDate.getTime() > now.getTime()).length;
  const activeBannersCount = activeBannersRaw.filter((b) => isCurrentlyActiveByDateRange(now, b.startDate, b.endDate, b.isActive)).length;

  return NextResponse.json({
    products: { total: totalProducts, active: activeProducts, inactive: inactiveProducts },
    inventory: inventorySummary,
    campaigns: { active: activeCampaignsCount, planned: plannedCampaignsCount, total: campaigns.length },
    banners: { active: activeBannersCount, total: activeBannersRaw.length },
    catalog: { categories: totalCategories, brands: totalBrands },
    pendingImportJobs,
  });
}
