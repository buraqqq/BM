import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { categoryCreateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { uniqueSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } }, subcategories: true },
  });
  return NextResponse.json({ items: categories });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = categoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const slug = await uniqueSlug(parsed.data.title, async (c) => !!(await prisma.category.findUnique({ where: { slug: c } })));

  const category = await prisma.category.create({ data: { ...parsed.data, slug } });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "CATEGORY_CREATE",
    entity: "Category",
    entityId: category.id,
    ipAddress: getClientIp(req),
    metadata: { title: category.title },
  });

  return NextResponse.json(category, { status: 201 });
}
