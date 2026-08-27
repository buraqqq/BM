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
  type ZoneId,
  type Zone,
} from "@/lib/ai-designer-logic";
import { reviseZoneWithFallback } from "@/lib/ai-designer-llm";
import { generateMockVisualLayout } from "@/lib/ai-designer-inputs";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 12 — POST /api/ai-designer/revise
//
// Nokta revize: kullanıcı tüm tasarımı baştan yapmak yerine NUMARALI bir bölgeyi
// (Zone A/B/C/D) hedefler ve yalnızca o bölgeyi revize eder. LLM hedef bölgenin
// yüzdesini kullanıcının isteğine göre ayarlar (anahtar yoksa deterministik
// fallback). Çıktı: güncellenmiş tam tasarım (zones + BOM + maliyet + görsel).
// ==========================================================

const zoneSchema = z.object({
  id: z.enum(ZONE_IDS),
  areaPercent: z.coerce.number().min(0).max(100),
});

const reviseSchema = z.object({
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
  currentZones: z.array(zoneSchema).min(1).max(8),
  targetZone: z.enum(ZONE_IDS),
  instruction: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = reviseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 });
  }

  const { input, currentZones, targetZone, instruction } = parsed.data;

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

  const currentZonesTyped: Zone[] = currentZones.map((z) => ({
    id: z.id as ZoneId,
    title: "",
    description: "",
    areaPercent: z.areaPercent,
    areaSqm: 0,
  }));

  const output = await reviseZoneWithFallback(input, currentZonesTyped, targetZone as ZoneId, instruction, internalProducts, affiliateRefs);
  const visual = generateMockVisualLayout(output.result.zones);

  return NextResponse.json({ ...output, visual }, { status: 200 });
}
