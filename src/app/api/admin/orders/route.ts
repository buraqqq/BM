import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { serializeOrderSummary } from "@/lib/order-serialize";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 4C — GET /api/admin/orders (sipariş listesi)
// Bölüm L: durum filtresi + sipariş numarası arama + pagination (mevcut
// admin deseni). Müşteri PII içerdiği için STAFF değil ADMIN+ gerektirir
// (audit-log ile aynı hassasiyet düzeyi).
// ==========================================================
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const orderNumber = searchParams.get("orderNumber") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (orderNumber) where.orderNumber = { contains: orderNumber };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { user: { select: { name: true, surname: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((o) => ({
      ...serializeOrderSummary(o),
      customer: {
        name: o.user.name ?? null,
        surname: o.user.surname ?? null,
        email: o.user.email,
        phone: o.user.phone ?? null,
      },
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}
