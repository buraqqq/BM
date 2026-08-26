import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { attributeDefinitionCreateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Bölüm 10 — Esnek ürün özellikleri: tanım listesi (opsiyonel ?categoryId=
// ile "bu kategoride kullanılabilecek tüm tanımlar" — kendi tanımları +
// global (categoryId=null) tanımlar).
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");

  const where = categoryId ? { OR: [{ categoryId }, { categoryId: null }] } : {};

  const items = await prisma.productAttributeDefinition.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { category: { select: { id: true, title: true } } },
  });
  return NextResponse.json({
    items: items.map((a) => ({ ...a, options: a.optionsJson ? JSON.parse(a.optionsJson) : [] })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = attributeDefinitionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.productAttributeDefinition.findFirst({
    where: { categoryId: data.categoryId ?? null, key: data.key },
  });
  if (existing) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Bu kategori için aynı key'e sahip bir özellik zaten var" },
      { status: 400 }
    );
  }

  const def = await prisma.productAttributeDefinition.create({
    data: {
      categoryId: data.categoryId ?? null,
      key: data.key,
      name: data.name,
      type: data.type ?? "TEXT",
      unit: data.unit ?? null,
      optionsJson: data.options ? JSON.stringify(data.options) : null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "ATTRIBUTE_DEFINITION_CREATE",
    entity: "ProductAttributeDefinition",
    entityId: def.id,
    ipAddress: getClientIp(req),
    metadata: { key: def.key, name: def.name, categoryId: def.categoryId },
  });

  return NextResponse.json(def, { status: 201 });
}
