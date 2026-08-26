import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBanner } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * Bölüm 13 — yalnızca tarih aralığı İÇİNDE ve isActive=true olan bannerlar
 * döner. Bitiş tarihi geçen bannerlar otomatik olarak bu listeden düşer
 * (Test 6 — Bölüm 20).
 */
export async function GET() {
  const now = new Date();
  const banners = await prisma.banner.findMany({
    where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
    orderBy: { priority: "desc" },
  });
  return NextResponse.json({ items: banners.map(serializeBanner) });
}
