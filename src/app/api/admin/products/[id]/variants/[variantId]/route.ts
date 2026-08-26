import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { decimalToNumber } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  priceOverride: z.coerce.number().nonnegative().max(10_000_000).optional().nullable(),
  stock: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; variantId: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const variant = await prisma.productVariant.findUnique({ where: { id: params.variantId } });
  if (!variant || variant.productId !== params.id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.productVariant.update({ where: { id: params.variantId }, data: parsed.data });
  return NextResponse.json(decimalToNumber({ ...updated }, ["priceOverride"]));
}
