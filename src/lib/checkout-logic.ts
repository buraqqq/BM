// ==========================================================
// FAZ 4B — Bölüm 5/9/10/11/12/16/17: checkout ile ilgili SAF (DB'siz) iş
// mantığı.
//
// Neden ayrı bir dosya: src/lib/cart-logic.ts / address-rules.ts ile AYNI
// kurulmuş desen — hesaplama/karar mantığı saf fonksiyonlarda tutulur,
// gerçek Prisma çağrıları yalnızca API route'unda
// (src/app/api/checkout/validate/route.ts) ince bir katman olarak kalır.
// Bu dosyadaki HİÇBİR fonksiyon computeFinalPrice/computeCartTotals'ın
// yaptığı işi TEKRAR ETMİYOR — yalnızca cart-serialize.ts'in ZATEN
// hesapladığı satır bayraklarını (isActive/priceChanged/stockExceeded) ve
// zaten hesaplanmış subtotal'ı checkout'un kendi kararlarına (bloke mi,
// uyarı mı, kargo ücreti ne olacak, toplam ne) çevirir.
// ==========================================================

import { DELIVERY_METHODS, DELIVERY_METHOD_LABELS, type DeliveryMethod } from "@/lib/enums";

export function isValidDeliveryMethod(value: unknown): value is DeliveryMethod {
  return typeof value === "string" && (DELIVERY_METHODS as readonly string[]).includes(value);
}

// ----------------------------------------------------------
// Bölüm 5 — Delivery Address Snapshot
// ----------------------------------------------------------
export interface AddressSnapshotInput {
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

export type AddressSnapshot = AddressSnapshotInput;

/**
 * Bölüm 5 — "Checkout state içerisinde şu alanlar korunabilecek şekilde
 * tasarla... gelecekte OrderAddressSnapshot mantığı kurulabilecek şekilde
 * mimari tasarla." Order/OrderAddressSnapshot modeli BU FAZDA
 * OLUŞTURULMUYOR — bu fonksiyon yalnızca Address kaydından, ileride bire bir
 * bir OrderAddressSnapshot satırına kopyalanabilecek SABİT bir alan
 * kümesini PICK eder (id/userId/isDefault/title gibi checkout'ta anlamsız
 * veya gereksiz alanlar sızmaz). Müşteri adresini sonradan değiştirse/silse
 * bile, checkout anında üretilen bu snapshot nesnesi bağımsız kalır.
 */
export function buildAddressSnapshot(address: AddressSnapshotInput): AddressSnapshot {
  return {
    firstName: address.firstName,
    lastName: address.lastName,
    phone: address.phone,
    city: address.city,
    district: address.district,
    neighborhood: address.neighborhood,
    addressLine: address.addressLine,
    postalCode: address.postalCode,
    country: address.country,
  };
}

// ----------------------------------------------------------
// Bölüm 8/9 — Delivery price (future-ready, pricing engine'e gömülmedi)
// ----------------------------------------------------------
export interface ShippingCalculation {
  amount: number;
  /** false = bu tutar gerçek bir hesaplama DEĞİL, henüz belirlenmemiş demektir (Bölüm 8 — gerçek kargo ücreti uydurulmaz). */
  computed: boolean;
  note: string | null;
}

/**
 * Bölüm 9 — "İleride calculateShippingPrice() gibi ayrı bir servis
 * eklenebilecek şekilde yapılandır. Pricing engine içine kargo mantığını
 * gömme." Bu fonksiyon BİLEREK computeFinalPrice'tan tamamen bağımsız ve
 * KENDİ dosyasında — ileride gerçek bir kargo API'si eklendiğinde yalnızca
 * bu fonksiyonun gövdesi değişir, çağıran kod (route) ve pricing engine
 * ETKİLENMEZ.
 */
export function calculateShippingPrice(method: DeliveryMethod): ShippingCalculation {
  if (method === "PICKUP") {
    // Gel-Al'da "kargo" kavramı yok — ücret gerçekten 0, tahmin değil.
    return { amount: 0, computed: true, note: null };
  }
  // Bölüm 8 — Kargo API'si henüz yok: 0 kullanılıyor AMA "hesaplanmadı"
  // olarak AÇIKÇA işaretleniyor; sahte bir kargo ücreti üretilmiyor.
  return { amount: 0, computed: false, note: "Kargo ücreti henüz hesaplanmadı." };
}

// ----------------------------------------------------------
// Bölüm 10 — Checkout Total
// ----------------------------------------------------------
export interface CheckoutTotals {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
}

/**
 * Bölüm 10 — "PRODUCT SUBTOTAL + DELIVERY COST - DISCOUNT = TOTAL... AYNI
 * FİYAT HESAPLAMA MANTIĞINI İKİNCİ KEZ YAZMA." `subtotal`, çağıran
 * tarafından ZATEN computeCartTotals (cart-logic.ts, computeFinalPrice
 * üzerinden) ile hesaplanmış olarak verilir — burada YENİDEN
 * hesaplanmıyor, yalnızca kargo ve (şimdilik her zaman 0 olan)
 * checkout-seviyesi indirimle toplanıyor.
 */
export function computeCheckoutTotals(subtotal: number, shipping: ShippingCalculation): CheckoutTotals {
  // Bölüm 10 — bu fazda ayrı bir checkout-seviyesi kupon/indirim mekanizması
  // yok (ürün indirimleri zaten computeFinalPrice içinde final fiyata
  // yansımış durumda) — alan, gelecekteki bir indirim kodu özelliği için
  // şimdiden response şeklinde duruyor.
  const discount = 0;
  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const total = Math.round((roundedSubtotal + shipping.amount - discount) * 100) / 100;
  return { subtotal: roundedSubtotal, shipping: shipping.amount, discount, total };
}

// ----------------------------------------------------------
// Bölüm 11/12/21/22/24 — Price/stock/isActive revalidation → hata mı uyarı mı
// ----------------------------------------------------------
export interface CheckoutLineFlags {
  productId: string;
  productName: string;
  isActive: boolean;
  priceChanged: boolean;
  oldPrice: number;
  newPrice: number;
  stockExceeded: boolean;
  availableStock: number | null;
}

export interface CheckoutIssue {
  code: string;
  message: string;
  productId?: string;
}

/**
 * Bölüm 11/12/21: sepetteki her satır zaten cart-serialize.ts tarafından
 * GÜNCEL duruma göre (isActive/priceChanged/stockExceeded) etiketlenmiş
 * olarak gelir — burada bu bayraklar checkout'un iki kategorisine ayrılır:
 *   - HATA (errors) → checkout DEVAM EDEMEZ (valid:false): satıştan kalkmış
 *     ürün veya yetersiz stok. Kullanıcı /sepet'e dönüp düzeltmeli
 *     (Bölüm 13 — checkout içinde ikinci bir quantity/ürün yönetimi YOK).
 *   - UYARI (warnings) → checkout DEVAM EDEBİLİR ama kullanıcıya AÇIKÇA
 *     gösterilir (valid kalabilir): yalnızca fiyat değişikliği. Toplam zaten
 *     her zaman GÜNCEL fiyattan hesaplanıyor (Bölüm 17 ile aynı ilke —
 *     "fiyat değişikliği sessizce uygulanmamalı" kuralı, toplamı eskiye
 *     kilitlemek yerine eski/yeni fiyatı ayrıca göstermekle sağlanıyor).
 */
export function deriveCheckoutIssues(lines: CheckoutLineFlags[]): { errors: CheckoutIssue[]; warnings: CheckoutIssue[] } {
  const errors: CheckoutIssue[] = [];
  const warnings: CheckoutIssue[] = [];

  for (const line of lines) {
    if (!line.isActive) {
      errors.push({
        code: "PRODUCT_INACTIVE",
        productId: line.productId,
        message: `"${line.productName}" artık satışta değil. Devam etmeden önce sepetinizden kaldırmanız gerekiyor.`,
      });
      continue; // satıştan kalkmış bir ürün için stok/fiyat bilgisi anlamsız
    }
    if (line.stockExceeded) {
      errors.push({
        code: "STOCK_INSUFFICIENT",
        productId: line.productId,
        message: `"${line.productName}" için yeterli stok bulunmuyor${line.availableStock !== null ? ` (mevcut: ${line.availableStock} adet)` : ""}.`,
      });
    }
    if (line.priceChanged) {
      warnings.push({
        code: "PRICE_CHANGED",
        productId: line.productId,
        message: `"${line.productName}" ürününün fiyatı değişti: ${line.oldPrice.toFixed(2)} TL → ${line.newPrice.toFixed(2)} TL.`,
      });
    }
  }

  return { errors, warnings };
}

// ----------------------------------------------------------
// Bölüm 16 — Checkout Validation Response (tek, tutarlı gövde şekli)
// ----------------------------------------------------------
export interface CheckoutValidationResult {
  valid: boolean;
  cart?: { cartId: string; items: unknown[]; totals: unknown };
  delivery?: {
    method: DeliveryMethod;
    methodLabel: string;
    addressSnapshot: AddressSnapshot | null;
    pickupLocation: unknown | null;
    shipping: ShippingCalculation;
  };
  pricing?: CheckoutTotals;
  warnings?: CheckoutIssue[];
  errors?: CheckoutIssue[];
}

export interface AssembleCheckoutResponseInput {
  cartId: string;
  items: unknown[];
  cartTotals: unknown;
  method: DeliveryMethod;
  addressSnapshot: AddressSnapshot | null;
  pickupLocation: unknown | null;
  errors: CheckoutIssue[];
  warnings: CheckoutIssue[];
  subtotal: number;
}

/**
 * Bölüm 16 — "API mümkün olduğunca yapılandırılmış cevap döndürsün."
 * Response gövdesinin TEK üretildiği yer burası — route.ts bu fonksiyonu
 * çağırır, kendi başına gövde inşa etmez. Bu hem şekli tek bir yerde sabit
 * tutar hem de DB'siz unit test edilebilir kılar (bkz.
 * src/lib/__tests__/checkout-logic.test.ts — "checkout response structure"
 * senaryosu).
 */
export function assembleCheckoutResponse(input: AssembleCheckoutResponseInput): CheckoutValidationResult {
  if (input.errors.length > 0) {
    return { valid: false, errors: input.errors };
  }

  const shipping = calculateShippingPrice(input.method);
  const pricing = computeCheckoutTotals(input.subtotal, shipping);

  return {
    valid: true,
    cart: { cartId: input.cartId, items: input.items, totals: input.cartTotals },
    delivery: {
      method: input.method,
      methodLabel: DELIVERY_METHOD_LABELS[input.method],
      addressSnapshot: input.addressSnapshot,
      pickupLocation: input.pickupLocation,
      shipping,
    },
    pricing,
    warnings: input.warnings,
  };
}
