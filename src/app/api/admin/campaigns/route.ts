import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { campaignCreateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { decimalToNumber } from "@/lib/serialize";
import { uniqueSlug } from "@/lib/slug";
import { isCurrentlyActiveByDateRange } from "@/lib/date-range-active";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaigns = await prisma.campaign.findMany({
    orderBy: { startDate: "desc" },
    include: { products: { include: { product: true } }, category: true, subcategory: true },
  });
  const now = new Date();
  return NextResponse.json({
    items: campaigns.map((c) =>
      decimalToNumber(
        { ...c, isCurrentlyActive: isCurrentlyActiveByDateRange(now, c.startDate, c.endDate, c.isActive) },
        ["discountValue"]
      )
    ),
  });
}

// Bölüm 12 — kampanya oluşturma
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const slug = await uniqueSlug(data.name, async (c) => !!(await prisma.campaign.findUnique({ where: { slug: c } })));

  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      slug,
      description: data.description ?? null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      scope: data.scope,
      categoryId: data.scope === "CATEGORY" ? data.categoryId ?? null : null,
      subcategoryId: data.scope === "SUBCATEGORY" ? data.subcategoryId ?? null : null,
      startDate: data.startDate,
      endDate: data.endDate,
      bannerText: data.bannerText ?? null,
      ctaText: data.ctaText ?? null,
      ctaLink: data.ctaLink ?? null,
      isActive: data.isActive ?? true,
      ...(data.scope === "PRODUCT" && data.productIds
        ? { products: { create: data.productIds.map((productId) => ({ productId })) } }
        : {}),
    },
    include: { products: true },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "CAMPAIGN_CREATE",
    entity: "Campaign",
    entityId: campaign.id,
    ipAddress: getClientIp(req),
    metadata: { name: campaign.name, scope: campaign.scope, discountType: campaign.discountType, discountValue: data.discountValue },
  });

  return NextResponse.json(decimalToNumber({ ...campaign }, ["discountValue"]), { status: 201 });
}
