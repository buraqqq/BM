import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { categoryUpdateSchema, categoryMoveSchema, categoryArchiveSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { moveCategory } from "@/lib/category-tree";
import { serializeCategory } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const category = await prisma.category.findUnique({
    where: { id: params.id },
    include: { _count: { select: { products: true } }, children: true, attributeDefinitions: true },
  });
  if (!category) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ...serializeCategory(category), children: category.children.map(serializeCategory) });
}

// Bölüm 5 — genel alan güncellemesi (parent DEĞİŞTİRMEZ — bkz. PATCH /move)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await prisma.category.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = categoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { parentId: _ignoredParentId, ...rest } = parsed.data; // parent değişikliği yalnızca /move ile yapılır

  const updated = await prisma.category.update({ where: { id: params.id }, data: rest });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "CATEGORY_UPDATE",
    entity: "Category",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { fields: Object.keys(rest) },
  });

  return NextResponse.json(serializeCategory(updated));
}

// Bölüm 5 — sıralama/aktif-pasif/parent değişikliği bu genel PATCH ucundan yapılır.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await prisma.category.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);

  // Parent değişikliği isteniyorsa (move)
  if (body && "parentId" in body && Object.keys(body).every((k) => ["parentId"].includes(k))) {
    const parsed = categoryMoveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }
    try {
      await moveCategory(params.id, parsed.data.parentId);
    } catch (err) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: (err as Error).message }, { status: 400 });
    }
    await writeAuditLog({
      adminUserId: auth.session.user.id,
      action: "CATEGORY_MOVE",
      entity: "Category",
      entityId: params.id,
      ipAddress: getClientIp(req),
      metadata: { newParentId: parsed.data.parentId },
    });
    const moved = await prisma.category.findUnique({ where: { id: params.id } });
    return NextResponse.json(serializeCategory(moved!));
  }

  // Aksi halde aktif/pasif (archive) isteği
  const parsedArchive = categoryArchiveSchema.safeParse(body);
  if (!parsedArchive.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsedArchive.error.flatten() }, { status: 400 });
  }

  if (!parsedArchive.data.isActive) {
    // Bölüm 5 — "Ürün bağlı kategori silinmeye çalışılırsa güvenli şekilde
    // engelle veya archive/deactivate yaklaşımı kullan": burada hard delete
    // zaten yok (yalnızca isActive:false), ama alt kategorisi olan bir
    // kategoriyi pasifleştirmek de kafa karıştırıcı olabileceğinden uyarı
    // döndürülür (yine de admin isterse `force` ile devam edebilir).
    const childCount = await prisma.category.count({ where: { parentId: params.id } });
    const url = new URL(req.url);
    if (childCount > 0 && url.searchParams.get("force") !== "1") {
      return NextResponse.json(
        {
          error: "HAS_CHILDREN",
          message: `Bu kategorinin ${childCount} alt kategorisi var. Yine de pasifleştirmek için ?force=1 ekleyin (alt kategoriler etkilenmez, yalnızca bu kategori pasifleşir).`,
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.category.update({ where: { id: params.id }, data: { isActive: parsedArchive.data.isActive } });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "CATEGORY_ARCHIVE",
    entity: "Category",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { isActive: parsedArchive.data.isActive },
  });

  return NextResponse.json(serializeCategory(updated));
}

// Bölüm 5 — "HARD DELETE YAPMA": ürünlerdeki FK ilişkisi @relation(onDelete
// varsayılan = Restrict) zaten hard delete'i DB seviyesinde de engeller.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { error: "HARD_DELETE_DISABLED", message: "Kategoriler kalıcı olarak silinmez. Bunun yerine PATCH ile isActive=false gönderin." },
    { status: 405 }
  );
}
