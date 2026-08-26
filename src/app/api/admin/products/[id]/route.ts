import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { productUpdateSchema, productArchiveSchema, priceUpdateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { decimalToNumber } from "@/lib/serialize";

export const dynamic = "force-dynamic";

async function findProductOr404(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: { category: true, inventory: true } });
  return product;
}

// Bölüm 9 — READ PRODUCT (admin detay görünümü)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const product = await findProductOr404(params.id);
  if (!product) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(decimalToNumber({ ...product }, ["price", "compareAtPrice", "salePrice", "costPrice", "taxRate"]));
}

// Bölüm 9 — UPDATE PRODUCT (tam güncelleme)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await findProductOr404(params.id);
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const priceChanged = data.price !== undefined && Number(data.price) !== Number(existing.price);

  const updated = await prisma.product.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.subcategoryId !== undefined ? { subcategoryId: data.subcategoryId } : {}),
      ...(data.brandId !== undefined ? { brandId: data.brandId } : {}),
      ...(data.shortDescription !== undefined ? { shortDescription: data.shortDescription } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.compareAtPrice !== undefined ? { compareAtPrice: data.compareAtPrice } : {}),
      ...(data.salePrice !== undefined ? { salePrice: data.salePrice } : {}),
      ...(data.costPrice !== undefined ? { costPrice: data.costPrice } : {}),
      ...(data.taxRate !== undefined ? { taxRate: data.taxRate } : {}),
      ...(data.unit !== undefined ? { unit: data.unit } : {}),
      ...(data.weight !== undefined ? { weight: data.weight } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
      ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle } : {}),
      ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription } : {}),
    },
    include: { category: true, inventory: true },
  });

  if (priceChanged) {
    await prisma.priceHistory.create({
      data: {
        productId: params.id,
        field: "price",
        oldValue: existing.price,
        newValue: data.price!,
        reason: "manual",
        changedById: auth.session.user.id,
      },
    });
    await writeAuditLog({
      adminUserId: auth.session.user.id,
      action: "PRICE_UPDATE",
      entity: "Product",
      entityId: params.id,
      ipAddress: getClientIp(req),
      metadata: { oldPrice: Number(existing.price), newPrice: Number(data.price) },
    });
  }

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "PRODUCT_UPDATE",
    entity: "Product",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { fields: Object.keys(data) },
  });

  return NextResponse.json(decimalToNumber({ ...updated }, ["price", "compareAtPrice", "salePrice", "costPrice", "taxRate"]));
}

// Bölüm 9/15 — kısmi güncelleme: fiyat-yalnız değişiklik ya da archive/restore
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await findProductOr404(params.id);
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);

  // archive/restore isteği mi?
  if (body && typeof body.isActive === "boolean" && Object.keys(body).every((k) => ["isActive", "reason"].includes(k))) {
    const parsed = productArchiveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }
    const updated = await prisma.product.update({
      where: { id: params.id },
      data: { isActive: parsed.data.isActive },
      include: { category: true, inventory: true },
    });
    await writeAuditLog({
      adminUserId: auth.session.user.id,
      action: parsed.data.isActive ? "PRODUCT_RESTORE" : "PRODUCT_ARCHIVE",
      entity: "Product",
      entityId: params.id,
      ipAddress: getClientIp(req),
      metadata: { reason: parsed.data.reason ?? null, productName: existing.name },
    });
    return NextResponse.json(decimalToNumber({ ...updated }, ["price", "compareAtPrice", "salePrice", "costPrice", "taxRate"]));
  }

  // fiyat-yalnız güncelleme (Bölüm 15 senaryosu)
  const parsedPrice = priceUpdateSchema.safeParse(body);
  if (!parsedPrice.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsedPrice.error.flatten() }, { status: 400 });
  }
  const data = parsedPrice.data;
  const updated = await prisma.product.update({
    where: { id: params.id },
    data: {
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.compareAtPrice !== undefined ? { compareAtPrice: data.compareAtPrice } : {}),
      ...(data.salePrice !== undefined ? { salePrice: data.salePrice } : {}),
    },
    include: { category: true, inventory: true },
  });

  if (data.price !== undefined) {
    await prisma.priceHistory.create({
      data: {
        productId: params.id,
        field: "price",
        oldValue: existing.price,
        newValue: data.price,
        reason: data.reason ?? "manual",
        changedById: auth.session.user.id,
      },
    });
  }

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "PRICE_UPDATE",
    entity: "Product",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: {
      oldPrice: Number(existing.price),
      newPrice: data.price !== undefined ? Number(data.price) : Number(existing.price),
      reason: data.reason ?? null,
    },
  });

  return NextResponse.json(decimalToNumber({ ...updated }, ["price", "compareAtPrice", "salePrice", "costPrice", "taxRate"]));
}

// Bölüm 9 — "Hard delete yerine mümkün olduğunca archive/inactive mantığı kullan"
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    {
      error: "HARD_DELETE_DISABLED",
      message:
        "Ürünler kalıcı olarak silinmez (veri bütünlüğü ve denetlenebilirlik için). Bunun yerine PATCH ile isActive=false gönderin.",
    },
    { status: 405 }
  );
}
