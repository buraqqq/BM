// ==========================================================
// FAZ 4C — sipariş serileştirme. SAF fonksiyonlar (DB'siz): yüklenmiş
// Order + ilişkileri alır, API/UI için düz bir nesneye çevirir. Decimal
// alanlar number'a dönüştürülür (JSON'a Decimal yazılamaz). Buradaki HİÇBİR
// fonksiyon fiyat/toplam HESAPLAMAZ — değerler zaten DB'de snapshot olarak
// tutulur, yalnızca biçimlendirilir.
// ==========================================================

import type { Order, OrderItem, OrderAddressSnapshot, OrderStatusHistory } from "@prisma/client";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  DELIVERY_METHOD_LABELS,
  type OrderStatus,
  type PaymentStatus,
  type DeliveryMethod,
} from "@/lib/enums";

export type OrderWithRelations = Order & {
  items: OrderItem[];
  addressSnapshot: OrderAddressSnapshot | null;
  statusHistory: OrderStatusHistory[];
};

export interface SerializedOrderItem {
  productId: string | null;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SerializedOrderAddress {
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  neighborhood: string | null;
  addressLine: string;
  postalCode: string | null;
  country: string;
}

export function serializeOrderItem(item: OrderItem): SerializedOrderItem {
  return {
    productId: item.productId,
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    lineTotal: Number(item.lineTotal),
  };
}

export function serializeOrderAddress(snap: OrderAddressSnapshot | null): SerializedOrderAddress | null {
  if (!snap) return null;
  return {
    firstName: snap.firstName,
    lastName: snap.lastName,
    phone: snap.phone,
    city: snap.city,
    district: snap.district,
    neighborhood: snap.neighborhood,
    addressLine: snap.addressLine,
    postalCode: snap.postalCode,
    country: snap.country,
  };
}

/** Sipariş detayı (müşteri başarı/detay sayfası + admin detayı). */
export function serializeOrder(order: OrderWithRelations, opts?: { includeStatusHistory?: boolean }) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status,
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus,
    deliveryMethod: order.deliveryMethod,
    deliveryMethodLabel: DELIVERY_METHOD_LABELS[order.deliveryMethod as DeliveryMethod] ?? order.deliveryMethod,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    shippingAmount: Number(order.shippingAmount),
    shippingComputed: order.shippingComputed,
    shippingNote: order.shippingNote,
    total: Number(order.total),
    customerNote: order.customerNote,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map(serializeOrderItem),
    addressSnapshot: serializeOrderAddress(order.addressSnapshot),
    statusHistory: opts?.includeStatusHistory
      ? order.statusHistory.map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, createdAt: h.createdAt }))
      : undefined,
  };
}

/** Sipariş listesi satırı (müşteri "Siparişlerim" + admin listesi için ortak). */
export function serializeOrderSummary(order: Order) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status,
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus,
    deliveryMethod: order.deliveryMethod,
    deliveryMethodLabel: DELIVERY_METHOD_LABELS[order.deliveryMethod as DeliveryMethod] ?? order.deliveryMethod,
    total: Number(order.total),
    createdAt: order.createdAt,
  };
}
