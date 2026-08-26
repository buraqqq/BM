import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { campaignUpdateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { decimalToNumber } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: { products: { include: { product: { select: { id: true, name: true, sku: true, price: true, categoryId: true } } } }, category: true },
  });
  if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(decimalToNumber({ ...campaign }, ["discountValue"]));
}

// Bölüm 16 — PRODUCT kapsamlı kampanyalar için ürün ekle/çıkar. Ayrı, dar bir
// uç olarak tutuldu (PUT'un genel alan güncellemesiyle karışmasın diye).
const campaignProductsPatchSchema = z.object({
  add: z.array(z.string().min(1)).optional(),
  remove: z.array(z.string().min(1)).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = campaignProductsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { add = [], remove = [] } = parsed.data;

  await prisma.$transaction([
    ...(remove.length > 0
      ? [prisma.campaignProduct.deleteMany({ where: { campaignId: params.id, productId: { in: remove } } })]
      : []),
    ...(add.length > 0
      ? add.map((productId) =>
          prisma.campaignProduct.upsert({
            where: { campaignId_productId: { campaignId: params.id, productId } },
            create: { campaignId: params.id, productId },
            update: {},
          })
        )
      : []),
  ]);

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "CAMPAIGN_PRODUCT_ASSIGN",
    entity: "Campaign",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { added: add.length, removed: remove.length },
  });

  const updated = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: { products: { include: { product: { select: { id: true, name: true, sku: true } } } } },
  });
  return NextResponse.json(decimalToNumber({ ...updated }, ["discountValue"]));
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const existing = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = campaignUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.endDate <= parsed.data.startDate) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Bitiş tarihi başlangıçtan sonra olmalı" }, { status: 400 });
  }

  const updated = await prisma.campaign.update({ where: { id: params.id }, data: parsed.data });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "CAMPAIGN_UPDATE",
    entity: "Campaign",
    entityId: params.id,
    ipAddress: getClientIp(req),
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(decimalToNumber({ ...updated }, ["discountValue"]));
}
