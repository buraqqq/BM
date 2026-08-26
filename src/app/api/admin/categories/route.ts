import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { categoryCreateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { uniqueSlug } from "@/lib/slug";
import { planCategoryCreate, buildCategoryTree } from "@/lib/category-tree";
import { serializeCategory } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// Bölüm 3/5 — Kategori Admin. ?tree=1 verilirse iç içe ağaç, aksi halde düz liste döner.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const asTree = searchParams.get("tree") === "1";

  const categories = await prisma.category.findMany({
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  if (asTree) {
    return NextResponse.json({ tree: buildCategoryTree(categories) });
  }
  return NextResponse.json({ items: categories.map(serializeCategory) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = categoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
    if (!parent) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Geçersiz parentId" }, { status: 400 });
    }
  }

  const slug = await uniqueSlug(data.title, async (c) => !!(await prisma.category.findUnique({ where: { slug: c } })));

  // id önceden üretilir çünkü path hesaplaması (self id dahil) create'ten önce gerekir.
  const id = `cat_${crypto.randomUUID().replace(/-/g, "")}`;
  const plan = await planCategoryCreate(data.parentId ?? null, id);

  const category = await prisma.category.create({
    data: {
      id,
      slug,
      title: data.title,
      parentId: data.parentId ?? null,
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      icon: data.icon ?? null,
      color: data.color ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
      isFeatured: data.isFeatured ?? false,
      seoTitle: data.seoTitle ?? null,
      seoDescription: data.seoDescription ?? null,
      path: plan.path,
      depth: plan.depth,
    },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "CATEGORY_CREATE",
    entity: "Category",
    entityId: category.id,
    ipAddress: getClientIp(req),
    metadata: { title: category.title, parentId: category.parentId },
  });

  return NextResponse.json(serializeCategory(category), { status: 201 });
}
