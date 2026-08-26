import { describe, it, expect } from "vitest";
import {
  ORDER_STATUS_TRANSITIONS,
  canTransitionOrderStatus,
  getAllowedOrderStatusTransitions,
  isValidOrderStatus,
  isValidPaymentStatus,
  generateOrderNumber,
  ORDER_NUMBER_ALPHABET,
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_LENGTH,
  buildOrderLine,
  sumOrderSubtotal,
} from "@/lib/order-logic";

describe("order-logic — status transitions", () => {
  it("izinli geçişleri kabul eder", () => {
    expect(canTransitionOrderStatus("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransitionOrderStatus("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionOrderStatus("CONFIRMED", "PREPARING")).toBe(true);
    expect(canTransitionOrderStatus("PREPARING", "READY")).toBe(true);
    expect(canTransitionOrderStatus("READY", "SHIPPED")).toBe(true);
    expect(canTransitionOrderStatus("READY", "COMPLETED")).toBe(true);
    expect(canTransitionOrderStatus("SHIPPED", "COMPLETED")).toBe(true);
  });

  it("mantıksız geçişleri reddeder", () => {
    expect(canTransitionOrderStatus("CANCELLED", "SHIPPED")).toBe(false);
    expect(canTransitionOrderStatus("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransitionOrderStatus("COMPLETED", "SHIPPED")).toBe(false);
    expect(canTransitionOrderStatus("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransitionOrderStatus("PENDING", "SHIPPED")).toBe(false); // PENDING → SHIPPED atlayamaz
    expect(canTransitionOrderStatus("SHIPPED", "CANCELLED")).toBe(false); // kargoya verildikten sonra iptal (iade akışı ayrı)
  });

  it("terminal durumlar boş geçiş listesi döner", () => {
    expect(getAllowedOrderStatusTransitions("COMPLETED")).toEqual([]);
    expect(getAllowedOrderStatusTransitions("CANCELLED")).toEqual([]);
  });

  it("geçiş listesi beklenen sırada gelir", () => {
    expect(getAllowedOrderStatusTransitions("PENDING")).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(getAllowedOrderStatusTransitions("READY")).toEqual(["SHIPPED", "COMPLETED", "CANCELLED"]);
  });

  it("her transition haritası yalnızca geçerli durumlardan oluşur", () => {
    for (const [from, targets] of Object.entries(ORDER_STATUS_TRANSITIONS)) {
      expect(isValidOrderStatus(from)).toBe(true);
      for (const t of targets) expect(isValidOrderStatus(t)).toBe(true);
    }
  });
});

describe("order-logic — status/payment type guards", () => {
  it("geçerli değerleri tanır", () => {
    expect(isValidOrderStatus("PENDING")).toBe(true);
    expect(isValidOrderStatus("COMPLETED")).toBe(true);
    expect(isValidPaymentStatus("PENDING")).toBe(true);
    expect(isValidPaymentStatus("REFUNDED")).toBe(true);
  });

  it("geçersiz değerleri reddeder", () => {
    expect(isValidOrderStatus("HACK")).toBe(false);
    expect(isValidOrderStatus("")).toBe(false);
    expect(isValidOrderStatus(null)).toBe(false);
    expect(isValidPaymentStatus("CANCELLED")).toBe(false); // ödeme durumunda CANCELLED yok
    expect(isValidPaymentStatus("UNKNOWN")).toBe(false);
  });
});

describe("order-logic — order number generation", () => {
  it("deterministik randomBytes ile kararlı sonuç üretir", () => {
    const fake = () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(generateOrderNumber(fake)).toBe("BM-" + ORDER_NUMBER_ALPHABET.slice(0, 8));
  });

  it("prefix + uzunluk doğru", () => {
    const out = generateOrderNumber();
    expect(out.startsWith(ORDER_NUMBER_PREFIX)).toBe(true);
    expect(out.length).toBe(ORDER_NUMBER_PREFIX.length + ORDER_NUMBER_LENGTH);
  });

  it("yalnızca alfabedeki karakterleri kullanır (belirsiz karakter yok)", () => {
    const out = generateOrderNumber();
    const suffix = out.slice(ORDER_NUMBER_PREFIX.length);
    for (const ch of suffix) {
      expect(ORDER_NUMBER_ALPHABET.includes(ch)).toBe(true);
    }
    // 0/O, 1/I gibi belirsiz karakterler alfabede yok
    expect(ORDER_NUMBER_ALPHABET).not.toMatch(/[0O1I]/);
  });
});

describe("order-logic — line snapshot + subtotal", () => {
  it("satır snapshot doğru hesaplar", () => {
    const line = buildOrderLine({ productId: "p1", productName: "Ürün", sku: "SKU-1", quantity: 3, finalPrice: 10.5 });
    expect(line).toEqual({ productId: "p1", productName: "Ürün", sku: "SKU-1", quantity: 3, unitPrice: 10.5, lineTotal: 31.5 });
  });

  it("kuruş yuvarlaması doğru", () => {
    const line = buildOrderLine({ productId: "p1", productName: "Ürün", sku: "SKU-1", quantity: 2, finalPrice: 10.555 });
    expect(line.unitPrice).toBe(10.56);
    expect(line.lineTotal).toBe(21.12);
  });

  it("ara toplam satır toplamlarını toplar", () => {
    const lines = [
      buildOrderLine({ productId: "p1", productName: "A", sku: "S1", quantity: 2, finalPrice: 10 }),
      buildOrderLine({ productId: "p2", productName: "B", sku: "S2", quantity: 1, finalPrice: 5.5 }),
    ];
    expect(sumOrderSubtotal(lines)).toBe(25.5);
  });

  it("boş satır listesinde ara toplam 0", () => {
    expect(sumOrderSubtotal([])).toBe(0);
  });
});
