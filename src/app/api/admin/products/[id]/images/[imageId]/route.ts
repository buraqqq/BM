import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  altText: z.string().max(200).optional().nullable(),
  isPrimary: z.boolean().optional(),
  isMobilePrimary: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; imageId: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const image = await prisma.productImage.findUnique({ where: { id: params.imageId } });
  if (!image || image.productId !== params.id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.isPrimary) {
    await prisma.productImage.updateMany({ where: { productId: params.id }, data: { isPrimary: false } });
  }
  if (parsed.data.isMobilePrimary) {
    await prisma.productImage.updateMany({ where: { productId: params.id }, data: { isMobilePrimary: false } });
  }

  const updated = await prisma.productImage.update({ where: { id: params.imageId }, data: parsed.data });

  // Bölüm 28/40 — ana görsel / mobil ana görsel değişimi müşteriye görünen
  // içeriği doğrudan etkiler, bu yüzden diğer PRODUCT_UPDATE olayları gibi
  // denetleniyor. Yalnızca sıralama/alt metin gibi kozmetik değişikliklerde
  // (isPrimary/isMobilePrimary hiç değişmemişse) log gürültüsünü önlemek için
  // yazılmıyor.
  if (parsed.data.isPrimary || parsed.data.isMobilePrimary) {
    await writeAuditLog({
      adminUserId: auth.session.user.id,
      action: "PRODUCT_UPDATE",
      entity: "Product",
      entityId: params.id,
      ipAddress: getClientIp(req),
      metadata: {
        imageId: params.imageId,
        isPrimary: parsed.data.isPrimary,
        isMobilePrimary: parsed.data.isMobilePrimary,
      },
    });
  }

  return NextResponse.json(updated);
}

// Görsel kaydı ürün-içi bir galeri öğesidir (fiyat/stok gibi denetlenebilirlik
// gerektiren bir iş kaydı değildir) — burada hard delete kabul edilebilir.
export async function DELETE(req: NextRequest, { params }: { params: { id: string; imageId: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const image = await prisma.productImage.findUnique({ where: { id: params.imageId } });
  if (!image || image.productId !== params.id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.productImage.delete({ where: { id: params.imageId } });

  if (image.isPrimary) {
    const next = await prisma.productImage.findFirst({ where: { productId: params.id }, orderBy: { sortOrder: "asc" } });
    if (next) await prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
  }

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "PRODUCT_UPDATE",
    entity: "Product",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { imageRemoved: image.url },
  });

  return NextResponse.json({ ok: true });
}
