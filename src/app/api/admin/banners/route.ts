import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { bannerCreateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { isCurrentlyActiveByDateRange } from "@/lib/date-range-active";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const banners = await prisma.banner.findMany({ orderBy: { priority: "desc" } });
  const now = new Date();
  return NextResponse.json({
    items: banners.map((b) => ({ ...b, isCurrentlyVisible: isCurrentlyActiveByDateRange(now, b.startDate, b.endDate, b.isActive) })),
  });
}

// Bölüm 13 — banner oluşturma
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = bannerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const banner = await prisma.banner.create({
    data: {
      title: data.title,
      subtitle: data.subtitle ?? null,
      imageUrl: data.imageUrl,
      mobileImageUrl: data.mobileImageUrl ?? null,
      ctaText: data.ctaText ?? null,
      ctaLink: data.ctaLink ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      priority: data.priority ?? 0,
      isActive: data.isActive ?? true,
      targetCategoryId: data.targetCategoryId ?? null,
      targetProductId: data.targetProductId ?? null,
      targetCampaignId: data.targetCampaignId ?? null,
    },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "BANNER_CREATE",
    entity: "Banner",
    entityId: banner.id,
    ipAddress: getClientIp(req),
    metadata: { title: banner.title, startDate: banner.startDate, endDate: banner.endDate },
  });

  return NextResponse.json(banner, { status: 201 });
}
