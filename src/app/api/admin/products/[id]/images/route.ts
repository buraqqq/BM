import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Bölüm 28 — Ürün görselleri: ana görsel + galeri + sıralama + alt text.
// Görsel dosyası önce POST /api/admin/upload ile yüklenir (MIME/boyut
// kontrolü orada yapılır), dönen url burada ürüne eklenir.
const addImageSchema = z.object({
  url: z.string().min(1).max(1000),
  altText: z.string().max(200).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = addImageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const count = await prisma.productImage.count({ where: { productId: params.id } });
  const makesPrimary = parsed.data.isPrimary ?? count === 0; // ilk görsel otomatik ana görsel olur

  if (makesPrimary) {
    await prisma.productImage.updateMany({ where: { productId: params.id }, data: { isPrimary: false } });
  }

  const image = await prisma.productImage.create({
    data: {
      productId: params.id,
      url: parsed.data.url,
      altText: parsed.data.altText ?? null,
      isPrimary: makesPrimary,
      sortOrder: count,
    },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "PRODUCT_UPDATE",
    entity: "Product",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { imageAdded: image.url },
  });

  return NextResponse.json(image, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const images = await prisma.productImage.findMany({ where: { productId: params.id }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ items: images });
}
