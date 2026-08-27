import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeFinalPrice, getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { generateDesignWithFallback } from "@/lib/ai-designer-llm";
import {
  SPACE_TYPES,
  FACADES,
  LIGHTS,
  CLIMATES,
  USAGES,
  BUDGETS,
} from "@/lib/ai-designer-logic";
import { applyCommand, generateMockVisualLayout } from "@/lib/ai-designer-inputs";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 5 — POST /api/ai-designer/design
//
// Halka açık. Yapılandırılmış alan girdisi + OPSİYONEL yazılı/sesli komut
// (textCommand) alır; komut kural-tabanlı parser ile girdiye uygulanır. Gerçek
// iç envanter + affiliate kataloğuyla eşleştirilmiş tasarım + deterministik
// mock görsel yerleşim döner. Hiçbir veri YAZMAZ; öneriler yalnızca GERÇEK
// ürünlerden seçilir.
// ==========================================================

const spaceInputSchema = z.object({
  spaceType: z.enum(SPACE_TYPES),
  widthMeters: z.coerce.number().min(0.5).max(1000),
  depthMeters: z.coerce.number().min(0.5).max(1000),
  facade: z.enum(FACADES),
  light: z.enum(LIGHTS),
  climate: z.enum(CLIMATES),
  windExposed: z.boolean(),
  usages: z.array(z.enum(USAGES)).min(1),
  budget: z.enum(BUDGETS),
  textCommand: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = spaceInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 });
  }
  const { textCommand, ...rawInput } = parsed.data;
  const input = applyCommand(rawInput, textCommand);

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

  const output = await generateDesignWithFallback(input, internalProducts, affiliateRefs);
  const visual = generateMockVisualLayout(output.result.zones);

  return NextResponse.json({ ...output, input, visual }, { status: 200 });
}
