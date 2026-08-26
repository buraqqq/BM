import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { bannerUpdateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await prisma.banner.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = bannerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.banner.update({ where: { id: params.id }, data: parsed.data });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "BANNER_UPDATE",
    entity: "Banner",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(updated);
}
