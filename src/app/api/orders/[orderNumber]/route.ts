import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/require-customer";
import { serializeOrder } from "@/lib/order-serialize";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 4C — GET /api/orders/[orderNumber] (müşteri kendi siparişinin detayı)
// Bölüm K: IDOR koruması. orderNumber var ama BAŞKASINA aitse veya hiç YOKSA
// AYNI 404 ORDER_NOT_FOUND döner — "bu sipariş var ama sana ait değil" ile
// "bu sipariş hiç yok" arasındaki fark dışarı sızdırılmaz (FAZ 4A/4B'deki
// findOwnedAddress deseninin order karşılığı).
// ==========================================================
export async function GET(_req: NextRequest, { params }: { params: { orderNumber: string } }) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      addressSnapshot: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!order || order.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "ORDER_NOT_FOUND", message: "Sipariş bulunamadı." }, { status: 404 });
  }

  return NextResponse.json(serializeOrder(order, { includeStatusHistory: true }));
}
