import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { brandUpdateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { serializeBrand } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await prisma.brand.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = brandUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.brand.update({ where: { id: params.id }, data: parsed.data });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "BRAND_UPDATE",
    entity: "Brand",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(serializeBrand(updated));
}

// Bölüm 6 — hard delete yok, yalnızca isActive:false (ürünlerdeki brandId
// FK'si zaten hard delete'i DB seviyesinde de engeller — onDelete varsayılan Restrict değil,
// SetNull olduğu için ürünler etkilenmez ama tutarlılık için archive tercih edilir).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { error: "HARD_DELETE_DISABLED", message: "Markalar kalıcı olarak silinmez. Bunun yerine PUT ile isActive=false gönderin." },
    { status: 405 }
  );
}
