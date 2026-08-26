import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { brandCreateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { uniqueSlug } from "@/lib/slug";
import { serializeBrand } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// Bölüm 6 — Marka Yönetimi
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return NextResponse.json({ items: brands.map(serializeBrand) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = brandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const slug = await uniqueSlug(data.name, async (c) => !!(await prisma.brand.findUnique({ where: { slug: c } })));

  const brand = await prisma.brand.create({
    data: {
      name: data.name,
      slug,
      logoUrl: data.logoUrl ?? null,
      description: data.description ?? null,
      website: data.website ?? null,
      isActive: data.isActive ?? true,
      seoTitle: data.seoTitle ?? null,
      seoDescription: data.seoDescription ?? null,
    },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "BRAND_CREATE",
    entity: "Brand",
    entityId: brand.id,
    ipAddress: getClientIp(req),
    metadata: { name: brand.name },
  });

  return NextResponse.json(serializeBrand(brand), { status: 201 });
}
