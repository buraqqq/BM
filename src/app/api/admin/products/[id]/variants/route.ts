import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { decimalToNumber } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const variantCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(64),
  priceOverride: z.coerce.number().nonnegative().max(10_000_000).optional().nullable(),
  stock: z.coerce.number().int().min(0).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const items = await prisma.productVariant.findMany({ where: { productId: params.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ items: items.map((v) => decimalToNumber({ ...v }, ["priceOverride"])) });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = variantCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const existingSku = await prisma.productVariant.findUnique({ where: { sku: parsed.data.sku } });
  if (existingSku) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Bu varyant SKU'su zaten kullanılıyor" }, { status: 400 });
  }

  const variant = await prisma.productVariant.create({
    data: {
      productId: params.id,
      name: parsed.data.name,
      sku: parsed.data.sku,
      priceOverride: parsed.data.priceOverride ?? null,
      stock: parsed.data.stock ?? 0,
    },
  });

  return NextResponse.json(decimalToNumber({ ...variant }, ["priceOverride"]), { status: 201 });
}
