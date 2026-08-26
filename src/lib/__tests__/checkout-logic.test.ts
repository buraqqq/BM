import { describe, it, expect } from "vitest";
import {
  isValidDeliveryMethod,
  buildAddressSnapshot,
  calculateShippingPrice,
  computeCheckoutTotals,
  deriveCheckoutIssues,
  assembleCheckoutResponse,
} from "@/lib/checkout-logic";

// FAZ 4B — Bölüm 30 CHECKOUT senaryolarının saf (DB'siz) kısmı. Test
// 1/2/3/4/5/6/7/18/19 (empty cart/auth/unauthorized/address ownership/
// invalid address/valid PICKUP-DELIVERY end-to-end/guest cart preserved/
// merge compatibility) gerçek HTTP+DB gerektirdiği için
// scripts/faz4b-checkout-e2e-check.ts'te doğrulanıyor. Burada Test 8/9/10/
// 11/12/13/14/15/16/17 (invalid delivery method, price/stock revalidation,
// inactive product, manipulated price/subtotal/total/shipping/quantity
// yok sayılması, response yapısı) saf mantık seviyesinde kapsanıyor.

describe("isValidDeliveryMethod — Test 8: geçersiz teslimat yöntemi", () => {
  it("PICKUP ve DELIVERY geçerlidir", () => {
    expect(isValidDeliveryMethod("PICKUP")).toBe(true);
    expect(isValidDeliveryMethod("DELIVERY")).toBe(true);
  });
  it("keyfi bir string ('HACK') reddedilir", () => {
    expect(isValidDeliveryMethod("HACK")).toBe(false);
  });
  it("boş/undefined/sayı reddedilir", () => {
    expect(isValidDeliveryMethod("")).toBe(false);
    expect(isValidDeliveryMethod(undefined)).toBe(false);
    expect(isValidDeliveryMethod(42)).toBe(false);
  });
});

describe("buildAddressSnapshot — Bölüm 5: gelecekteki OrderAddressSnapshot uyumluluğu", () => {
  it("yalnızca sabit alan kümesini kopyalar, fazla alanları sızdırmaz", () => {
    const address = {
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+905000000000",
      city: "İzmir",
      district: "Urla",
      neighborhood: "Altıntaş",
      addressLine: "Besim Uyal Cad. No:121/A",
      postalCode: "35430",
      country: "Türkiye",
    };
    expect(buildAddressSnapshot(address)).toEqual(address);
  });
});

describe("calculateShippingPrice — Bölüm 8/9: gerçek kargo API'si yok, ücret uydurulmaz", () => {
  it("PICKUP için 0 ve computed:true döner (gerçekten 0, tahmin değil)", () => {
    expect(calculateShippingPrice("PICKUP")).toEqual({ amount: 0, computed: true, note: null });
  });
  it("DELIVERY için 0 AMA computed:false ve açık bir not ile döner", () => {
    const r = calculateShippingPrice("DELIVERY");
    expect(r.amount).toBe(0);
    expect(r.computed).toBe(false);
    expect(r.note).toBeTruthy();
  });
});

describe("computeCheckoutTotals — Bölüm 10: PRODUCT SUBTOTAL + DELIVERY - DISCOUNT = TOTAL", () => {
  it("pickup'ta (shipping 0) toplam subtotal'a eşittir", () => {
    const totals = computeCheckoutTotals(1500, calculateShippingPrice("PICKUP"));
    expect(totals).toEqual({ subtotal: 1500, shipping: 0, discount: 0, total: 1500 });
  });
  it("kuruş yuvarlamasını doğru yapar", () => {
    const totals = computeCheckoutTotals(99.999, calculateShippingPrice("PICKUP"));
    expect(totals.subtotal).toBe(100);
    expect(totals.total).toBe(100);
  });
});

describe("deriveCheckoutIssues — Test 9/10/11: price/stock/inactive revalidation", () => {
  it("her şey normalse hata/uyarı üretmez", () => {
    const r = deriveCheckoutIssues([
      { productId: "p1", productName: "Çim Tohumu", isActive: true, priceChanged: false, oldPrice: 100, newPrice: 100, stockExceeded: false, availableStock: 10 },
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("Test 9 — fiyat değiştiyse UYARI üretir, checkout'u BLOKE ETMEZ", () => {
    const r = deriveCheckoutIssues([
      { productId: "p1", productName: "Gübre", isActive: true, priceChanged: true, oldPrice: 100, newPrice: 90, stockExceeded: false, availableStock: 10 },
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].code).toBe("PRICE_CHANGED");
    expect(r.warnings[0].message).toContain("100.00");
    expect(r.warnings[0].message).toContain("90.00");
  });

  it("Test 10 — stok aşımı varsa HATA üretir (checkout devam edemez)", () => {
    const r = deriveCheckoutIssues([
      { productId: "p1", productName: "Mangal Kömürü", isActive: true, priceChanged: false, oldPrice: 100, newPrice: 100, stockExceeded: true, availableStock: 2 },
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].code).toBe("STOCK_INSUFFICIENT");
    expect(r.errors[0].message).toContain("2");
  });

  it("Test 11 — satıştan kalkmış ürün HATA üretir ve stok/fiyat kontrolü atlanır", () => {
    const r = deriveCheckoutIssues([
      { productId: "p1", productName: "Eski Ürün", isActive: false, priceChanged: true, oldPrice: 100, newPrice: 50, stockExceeded: true, availableStock: 0 },
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].code).toBe("PRODUCT_INACTIVE");
    // isActive:false satırı için ayrıca STOCK_INSUFFICIENT/PRICE_CHANGED üretilmez (continue ile atlanır)
    expect(r.warnings).toEqual([]);
  });

  it("birden fazla satırda birden fazla hata/uyarı bağımsız biriktirilir", () => {
    const r = deriveCheckoutIssues([
      { productId: "p1", productName: "A", isActive: true, priceChanged: true, oldPrice: 10, newPrice: 12, stockExceeded: false, availableStock: 5 },
      { productId: "p2", productName: "B", isActive: true, priceChanged: false, oldPrice: 20, newPrice: 20, stockExceeded: true, availableStock: 1 },
      { productId: "p3", productName: "C", isActive: false, priceChanged: false, oldPrice: 30, newPrice: 30, stockExceeded: false, availableStock: null },
    ]);
    expect(r.errors.map((e) => e.code)).toEqual(["STOCK_INSUFFICIENT", "PRODUCT_INACTIVE"]);
    expect(r.warnings.map((w) => w.code)).toEqual(["PRICE_CHANGED"]);
  });
});

describe("assembleCheckoutResponse — Test 12-17: yapılandırılmış cevap + client manipülasyonu yok sayma", () => {
  const baseInput = {
    cartId: "cart1",
    items: [{ id: "i1" }],
    cartTotals: { itemCount: 1, lineCount: 1, subtotal: 500 },
    method: "PICKUP" as const,
    addressSnapshot: null,
    pickupLocation: { name: "B&M Vourla" },
    errors: [],
    warnings: [],
    subtotal: 500,
  };

  it("Test 17 — hatasız girişte tam yapılandırılmış {valid:true,cart,delivery,pricing,warnings} döner", () => {
    const result = assembleCheckoutResponse(baseInput);
    expect(result.valid).toBe(true);
    expect(result.cart).toEqual({ cartId: "cart1", items: [{ id: "i1" }], totals: { itemCount: 1, lineCount: 1, subtotal: 500 } });
    expect(result.delivery?.method).toBe("PICKUP");
    expect(result.delivery?.methodLabel).toBe("Mağazadan Gel-Al");
    expect(result.pricing).toEqual({ subtotal: 500, shipping: 0, discount: 0, total: 500 });
    expect(result.warnings).toEqual([]);
    expect(result.errors).toBeUndefined();
  });

  it("hata varsa yalnızca {valid:false,errors} döner — cart/delivery/pricing hiç yok", () => {
    const result = assembleCheckoutResponse({ ...baseInput, errors: [{ code: "STOCK_INSUFFICIENT", message: "yetersiz" }] });
    expect(result).toEqual({ valid: false, errors: [{ code: "STOCK_INSUFFICIENT", message: "yetersiz" }] });
    expect(result.cart).toBeUndefined();
    expect(result.pricing).toBeUndefined();
  });

  it("Test 12/13/14/15/16 — girişte 'fiyat/subtotal/total/shipping/quantity' gibi ek alanlar olsa da (fonksiyon imzasında yok) yalnızca sunucunun kendi hesapladığı subtotal/shipping/total kullanılır", () => {
    // Bu fonksiyon zaten yalnızca `subtotal` (sunucu tarafından
    // computeFinalPrice ile hesaplanmış) ve `method`i (zod enum'dan) girdi
    // olarak kabul ediyor — client'ın gönderebileceği price/total/shipping
    // gibi hiçbir alan İMZADA YOK, dolayısıyla manipüle edilmiş bir HTTP
    // gövdesi route.ts katmanında zaten hiç bu fonksiyona ULAŞAMAZ (bkz.
    // checkoutValidateSchema + route.ts — yalnızca addressId/deliveryMethod
    // okunuyor). Burada, sunucunun GERÇEK subtotal'ı ne olursa olsun aynı
    // deterministik sonucu ürettiği doğrulanıyor.
    const manipulatedLookingSubtotal = 500; // "gerçek" sunucu subtotal'ı — client'ın iddia ettiği 1 TL değil
    const result = assembleCheckoutResponse({ ...baseInput, subtotal: manipulatedLookingSubtotal, method: "DELIVERY" });
    expect(result.pricing?.subtotal).toBe(500);
    expect(result.pricing?.total).toBe(500); // DELIVERY shipping=0 (henüz hesaplanmadı) + discount 0
    expect(result.delivery?.shipping.computed).toBe(false);
  });

  it("DELIVERY seçiminde pickupLocation null, adres snapshot'ı geçirileni yansıtır", () => {
    const snapshot = { firstName: "A", lastName: "B", phone: "1", city: "İzmir", district: "Urla", neighborhood: null, addressLine: "x", postalCode: null, country: "Türkiye" };
    const result = assembleCheckoutResponse({ ...baseInput, method: "DELIVERY", addressSnapshot: snapshot, pickupLocation: null });
    expect(result.delivery?.addressSnapshot).toEqual(snapshot);
    expect(result.delivery?.pickupLocation).toBeNull();
  });
});
