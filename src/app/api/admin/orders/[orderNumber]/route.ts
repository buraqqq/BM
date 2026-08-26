import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { serializeOrder } from "@/lib/order-serialize";
import {
  isValidOrderStatus,
  isValidPaymentStatus,
  canTransitionOrderStatus,
  getAllowedOrderStatusTransitions,
  type OrderStatus,
} from "@/lib/order-logic";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 4C — GET/PATCH /api/admin/orders/[orderNumber]
//
// GET  → sipariş detayı (snapshot'lar + müşteri + durum geçmişi + izinli
//        geçişler dahil).
// PATCH → sipariş durumu (status) ve/veya ödeme durumu (paymentStatus) güncelle.
//   - status: order-logic.ts'teki transition kuralları SERVER-SIDE doğrulanır;
//     geçersiz geçiş (örn. CANCELLED → SHIPPED) 422 ile reddedilir.
//   - paymentStatus: yalnızca geçerli PAYMENT_STATUSES değerleri kabul edilir;
//     GERÇEK ödeme başlatılmaz — bu, manuel bir yönetim kaydıdır.
//   - Her iki değişiklik de AuditLog'a yazılır (Bölüm L) ve durum geçişi
//     OrderStatusHistory'ye eklenir (Bölüm M).
// ==========================================================

const orderInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
  addressSnapshot: true,
  statusHistory: { orderBy: { createdAt: "asc" as const } },
  user: { select: { name: true, surname: true, email: true, phone: true } },
};

export async function GET(_req: NextRequest, { params }: { params: { orderNumber: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const order = await prisma.order.findUnique({ where: { orderNumber: params.orderNumber }, include: orderInclude });
  if (!order) return NextResponse.json({ error: "ORDER_NOT_FOUND", message: "Sipariş bulunamadı." }, { status: 404 });

  return NextResponse.json({
    ...serializeOrder(order, { includeStatusHistory: true }),
    customer: {
      name: order.user.name ?? null,
      surname: order.user.surname ?? null,
      email: order.user.email,
      phone: order.user.phone ?? null,
    },
    allowedStatusTransitions: getAllowedOrderStatusTransitions(order.status as OrderStatus),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const status = body?.status as unknown;
  const paymentStatus = body?.paymentStatus as unknown;

  if (status === undefined && paymentStatus === undefined) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Güncellenecek alan yok." }, { status: 422 });
  }

  const order = await prisma.order.findUnique({ where: { orderNumber: params.orderNumber } });
  if (!order) return NextResponse.json({ error: "ORDER_NOT_FOUND", message: "Sipariş bulunamadı." }, { status: 404 });

  // Bölüm D — durum geçişini server-side doğrula.
  if (status !== undefined) {
    if (!isValidOrderStatus(status)) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Geçersiz sipariş durumu." }, { status: 422 });
    }
    if (!canTransitionOrderStatus(order.status as OrderStatus, status)) {
      return NextResponse.json(
        { error: "INVALID_TRANSITION", message: `"${order.status}" → "${status}" geçişi geçersiz.` },
        { status: 422 }
      );
    }
  }

  // Bölüm E — ödeme durumu doğrula (gerçek ödeme yok, yalnızca manuel kayıt).
  if (paymentStatus !== undefined && !isValidPaymentStatus(paymentStatus)) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Geçersiz ödeme durumu." }, { status: 422 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data: Record<string, string> = {};
    if (status !== undefined) data.status = status as string;
    if (paymentStatus !== undefined) data.paymentStatus = paymentStatus as string;

    const o = await tx.order.update({ where: { id: order.id }, data });

    if (status !== undefined && status !== order.status) {
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: order.status, toStatus: status as string },
      });
    }
    return o;
  });

  // Bölüm L — audit log (best-effort ama sessizce yutulmaz, bkz. audit.ts).
  const ip = getClientIp(req);
  const adminId = auth.session.user.id;
  if (status !== undefined && status !== order.status) {
    await writeAuditLog({
      adminUserId: adminId,
      action: "ORDER_STATUS_UPDATE",
      entity: "Order",
      entityId: order.id,
      ipAddress: ip,
      metadata: { orderNumber: order.orderNumber, fromStatus: order.status, toStatus: status },
    });
  }
  if (paymentStatus !== undefined && paymentStatus !== order.paymentStatus) {
    await writeAuditLog({
      adminUserId: adminId,
      action: "ORDER_PAYMENT_STATUS_UPDATE",
      entity: "Order",
      entityId: order.id,
      ipAddress: ip,
      metadata: { orderNumber: order.orderNumber, fromPaymentStatus: order.paymentStatus, toPaymentStatus: paymentStatus },
    });
  }

  const full = await prisma.order.findUnique({ where: { id: updated.id }, include: orderInclude });
  return NextResponse.json({
    ...serializeOrder(full!, { includeStatusHistory: true }),
    customer: full!.user ? { name: full!.user.name, surname: full!.user.surname, email: full!.user.email, phone: full!.user.phone } : null,
    allowedStatusTransitions: getAllowedOrderStatusTransitions(updated.status as OrderStatus),
  });
}
