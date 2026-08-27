import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { buildAffiliateUrl, generateTrackingCode } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 7 — GET /api/affiliate/redirect?id=...
// Outbound click tracking: tıklamayı AuditLog'a kaydeder (entity "Affiliate",
// action "AFFILIATE_CLICK"), sonra UTM + ref parametreli dış linke 302 yönlendirir.
// Geçersiz/pasif ürün → güvenli şekilde tasarım sayfasına döner.
// ==========================================================
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const aff = await prisma.affiliateProduct.findUnique({ where: { id } });
  if (!aff || !aff.isActive) {
    return NextResponse.redirect(new URL("/bahce-tasarimi", req.url), 302);
  }

  await writeAuditLog({
    adminUserId: null,
    action: "AFFILIATE_CLICK",
    entity: "Affiliate",
    entityId: aff.id,
    ipAddress: getClientIp(req),
    metadata: { vendor: aff.vendor, category: aff.category },
  });

  return NextResponse.redirect(buildAffiliateUrl(aff.affiliateUrl, generateTrackingCode(aff.id)), 302);
}
