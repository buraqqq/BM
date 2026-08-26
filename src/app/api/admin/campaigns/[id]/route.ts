import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { campaignUpdateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { decimalToNumber } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = campaignUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.endDate <= parsed.data.startDate) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Bitiş tarihi başlangıçtan sonra olmalı" }, { status: 400 });
  }

  const updated = await prisma.campaign.update({ where: { id: params.id }, data: parsed.data });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "CAMPAIGN_UPDATE",
    entity: "Campaign",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(decimalToNumber({ ...updated }, ["discountValue"]));
}
