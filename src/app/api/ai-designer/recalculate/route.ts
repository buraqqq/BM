import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeFinalPrice, getCurrentlyActiveCampaigns } from "@/lib/pricing";
import {
  SPACE_TYPES,
  FACADES,
  LIGHTS,
  CLIMATES,
  USAGES,
  BUDGETS,
  ZONE_IDS,
  buildZonesFromLayout,
  generateDesignWithZones,
  type ZoneId,
} from "@/lib/ai-designer-logic";
import { generateMockVisualLayout } from "@/lib/ai-designer-inputs";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 12 — POST /api/ai-designer/recalculate
//
// Puzzle düzenleme sonrası BOM + maliyeti deterministik olarak yeniden hesaplar.
// LLM ÇAĞIRMAZ (kural-tabanlı) — kullanıcı bölge sırasını/yüzdelerini
// değiştirdiğinde hızlı, ücretsiz ve tutarlı güncelleme sağlar. Girdi: orijinal
// SpaceInput + kullanıcının özel bölge yerleşimi (sıra + yüzde). Çıktı: yeni
// zones + BOM + eşleştirilmiş kalemler + maliyet + görsel.
// ==========================================================

const zoneLayoutSchema = z.object({
  id: z.enum(ZONE_IDS),
  areaPercent: z.coerce.number().min(0).max(100),
});

const recalcSchema = z.object({
  input: z.object({
    spaceType: z.enum(SPACE_TYPES),
    widthMeters: z.coerce.number().min(0.5).max(1000),
    depthMeters: z.coerce.number().min(0.5).max(1000),
    facade: z.enum(FACADES),
    light: z.enum(LIGHTS),
    climate: z.enum(CLIMATES),
    windExposed: z.boolean(),
    usages: z.array(z.enum(USAGES)).min(1),
    budget: z.enum(BUDGETS),
  }),
  zones: z.array(zoneLayoutSchema).min(1).max(8),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = recalcSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 });
  }

  const { input, zones: layout } = parsed.data;

  const [products, affiliateProducts, activeCampaigns] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, include: { category: true, inventory: true } }),
    prisma.affiliateProduct.findMany({ where: { isActive: true } }),
    getCurrentlyActiveCampaigns(),
  ]);

  const internalProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    slug: p.slug,
    price: Math.round(computeFinalPrice(p, activeCampaigns).finalPrice * 100) / 100,
    categorySlug: p.category.slug,
    unit: p.unit,
    stockQuantity: p.inventory?.quantity ?? null,
  }));

  const affiliateRefs = affiliateProducts.map((a) => ({
    id: a.id,
    name: a.name,
    vendor: a.vendor,
    affiliateUrl: a.affiliateUrl,
    category: a.category,
    estimatedPrice: a.estimatedPrice !== null ? Number(a.estimatedPrice) : null,
  }));

  const zones = buildZonesFromLayout(input, layout as { id: ZoneId; areaPercent: number }[]);
  const result = generateDesignWithZones(input, zones, internalProducts, affiliateRefs);
  const visual = generateMockVisualLayout(zones);

  return NextResponse.json({ result, visual }, { status: 200 });
}
