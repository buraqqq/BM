// ==========================================================
// FAZ 4C — siparişle ilgili SAF (DB'siz) iş mantığı.
//
// Mevcut desen (bkz. checkout-logic.ts, cart-logic.ts, address-rules.ts):
// hesaplama/karar mantığı saf fonksiyonlarda, gerçek Prisma çağrıları API
// route'larında ince bir katman olarak kalır. Bu dosyadaki HİÇBİR fonksiyon
// computeFinalPrice / computeCheckoutTotals'ın yaptığı işi TEKRAR ETMEZ:
//   - final birim fiyat, pricing engine'den (computeFinalPrice) gelir;
//   - kargo ücreti ve toplam, checkout-logic.ts'ten
//     (calculateShippingPrice + computeCheckoutTotals) gelir.
// Burada yalnızca siparişe ÖZGÜ kararlar (durum geçişi, sipariş numarası,
// satır snapshot) SAF olarak üretilir — böylece DB'siz birim test edilebilir.
// ==========================================================

import crypto from "crypto";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/enums";

// ----------------------------------------------------------
// Bölüm D — Order status geçişleri
// ----------------------------------------------------------

export function isValidOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isValidPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Yalnızca anlamlı geçişler. Terminal durumlar (COMPLETED, CANCELLED) boş
 * dizi döner — bir sipariş tamamlandıktan/iptal edildikten sonra hiçbir yeni
 * duruma geçemez (Bölüm D: "CANCELLED → SHIPPED imkânsız olmalı").
 *
 * Yaşam döngüsü (teslim yönteminden bağımsız, mağazadan-gel-al için de geçerli):
 *   PENDING → CONFIRMED → PREPARING → READY → SHIPPED → COMPLETED
 *                       (READY doğrudan COMPLETED'e de geçebilir — Gel-Al)
 *   Herhangi bir ön-durum (SHIPPED/COMPLETED hariç) CANCELLED'e geçebilir.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SHIPPED", "COMPLETED", "CANCELLED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function getAllowedOrderStatusTransitions(from: OrderStatus): OrderStatus[] {
  return [...ORDER_STATUS_TRANSITIONS[from]];
}

// ----------------------------------------------------------
// Bölüm B — Sipariş numarası (orderNumber)
//
// Tahmin edilmesi zor, URL/destekte kullanılabilir, kullanıcı dostu bir
// referans. Karışıklığı önlemek için 0/O, 1/I gibi belirsiz karakterler
// alfabeden çıkarıldı (32 karakter → 256 % 32 == 0, modulo bias yok).
// @unique DB constraint çakışmayı engeller; çakışma durumunda çağıran route
// birkaç kez yeniden dener. `randomBytes` enjekte edilebilir olduğu için
// birim test deterministik.
// ----------------------------------------------------------

export const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ORDER_NUMBER_PREFIX = "BM-";
export const ORDER_NUMBER_LENGTH = 8;

export function generateOrderNumber(
  randomBytes: (count: number) => Uint8Array = (n) => crypto.randomBytes(n)
): string {
  const bytes = randomBytes(ORDER_NUMBER_LENGTH);
  let suffix = "";
  for (let i = 0; i < ORDER_NUMBER_LENGTH; i++) {
    suffix += ORDER_NUMBER_ALPHABET[bytes[i] % ORDER_NUMBER_ALPHABET.length];
  }
  return ORDER_NUMBER_PREFIX + suffix;
}

// ----------------------------------------------------------
// Bölüm C — OrderItem snapshot
// ----------------------------------------------------------

export interface OrderLineInput {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  /** computeFinalPrice()'tan gelen GÜNCEL final fiyat — burada yeniden hesaplanmaz. */
  finalPrice: number;
}

export interface OrderLineSnapshot {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Bölüm C — sipariş satırının DEĞİŞMEZ snapshot'ı. Ürün adı/SKU/fiyat sonradan
 * değişse bile (hatta ürün arşivlense bile) geçmiş siparişte bu değerler
 * korunur. `finalPrice` zaten pricing engine'in ürettiği GERÇEK final fiyattır —
 * burada fiyat YENİDEN hesaplanmaz, yalnızca kuruşa yuvarlanıp satır toplamı
 * türetilir.
 */
export function buildOrderLine(input: OrderLineInput): OrderLineSnapshot {
  const unitPrice = Math.round(input.finalPrice * 100) / 100;
  const lineTotal = Math.round(input.quantity * unitPrice * 100) / 100;
  return {
    productId: input.productId,
    productName: input.productName,
    sku: input.sku,
    quantity: input.quantity,
    unitPrice,
    lineTotal,
  };
}

/** Bölüm C — ara toplam = SUM(lineTotal). Fiyat motoru tekrar yazılmaz. */
export function sumOrderSubtotal(lines: OrderLineSnapshot[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
}

export type { OrderStatus, PaymentStatus } from "@/lib/enums";
