import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { attributeDefinitionUpdateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await prisma.productAttributeDefinition.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = attributeDefinitionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { options, ...rest } = parsed.data;

  const updated = await prisma.productAttributeDefinition.update({
    where: { id: params.id },
    data: { ...rest, ...(options !== undefined ? { optionsJson: JSON.stringify(options) } : {}) },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "ATTRIBUTE_DEFINITION_UPDATE",
    entity: "ProductAttributeDefinition",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(updated);
}

// Hard delete yok — tanım kaldırılırsa geçmiş ürün verisi (ProductAttributeValue)
// anlamsız kalır; bunun yerine isActive:false ile formlardan gizlenir.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { error: "HARD_DELETE_DISABLED", message: "Özellik tanımları kalıcı olarak silinmez. Bunun yerine PUT ile isActive=false gönderin." },
    { status: 405 }
  );
}
