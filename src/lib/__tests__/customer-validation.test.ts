import { describe, it, expect } from "vitest";
import {
  customerRegisterSchema,
  addressCreateSchema,
  addressUpdateSchema,
  cartAddItemSchema,
  cartUpdateItemSchema,
  checkoutValidateSchema,
} from "@/lib/customer-validation";

// FAZ 4A — Bölüm 30: server-side Zod validation testleri (Test 1 — kayıt,
// Test 7/8 — adres create/update şema doğrulaması).

describe("customerRegisterSchema — Test 1: kayıt alan doğrulaması", () => {
  it("geçerli kayıt verisini kabul eder", () => {
    const result = customerRegisterSchema.safeParse({
      name: "Ali",
      surname: "Veli",
      email: "ali@example.com",
      phone: "05061234567",
      password: "sifre1234",
    });
    expect(result.success).toBe(true);
  });

  it("geçersiz e-postayı reddeder", () => {
    const result = customerRegisterSchema.safeParse({
      name: "Ali",
      surname: "Veli",
      email: "gecersiz-eposta",
      phone: "05061234567",
      password: "sifre1234",
    });
    expect(result.success).toBe(false);
  });

  it("eksik alanı reddeder", () => {
    const result = customerRegisterSchema.safeParse({ name: "Ali", email: "ali@example.com", password: "sifre1234" });
    expect(result.success).toBe(false);
  });

  it("harf içermeyen telefon numarasını (geçerli format) kabul eder", () => {
    const result = customerRegisterSchema.safeParse({
      name: "Ali",
      surname: "Veli",
      email: "ali2@example.com",
      phone: "+90 506 123 45 67",
      password: "sifre1234",
    });
    expect(result.success).toBe(true);
  });
});

describe("addressCreateSchema — Test 7: adres oluşturma alan doğrulaması", () => {
  const validAddress = {
    title: "Ev",
    firstName: "Ali",
    lastName: "Veli",
    phone: "05061234567",
    city: "İzmir",
    district: "Urla",
    addressLine: "Altıntaş Mah. Besim Uyal Cad. No:121/A",
  };

  it("geçerli adresi kabul eder", () => {
    expect(addressCreateSchema.safeParse(validAddress).success).toBe(true);
  });

  it("il/ilçe olmadan bir adres reddedilir (yalnızca İzmir'e kilitlenmeden, boş bırakılamaz)", () => {
    const { city: _city, ...rest } = validAddress;
    expect(addressCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("herhangi bir il (yalnızca İzmir'e kilitlenmemiş) kabul edilir", () => {
    expect(addressCreateSchema.safeParse({ ...validAddress, city: "Ankara", district: "Çankaya" }).success).toBe(true);
  });

  it("çok kısa açık adres reddedilir", () => {
    expect(addressCreateSchema.safeParse({ ...validAddress, addressLine: "kısa" }).success).toBe(false);
  });
});

describe("addressUpdateSchema — Test 8: kısmi güncelleme", () => {
  it("yalnızca tek bir alanla (partial) geçerlidir", () => {
    expect(addressUpdateSchema.safeParse({ isDefault: true }).success).toBe(true);
  });
  it("boş obje de geçerlidir (hiçbir şey değişmez)", () => {
    expect(addressUpdateSchema.safeParse({}).success).toBe(true);
  });
});

describe("cartAddItemSchema / cartUpdateItemSchema — Test 14: miktar doğrulaması", () => {
  it("quantity verilmezse opsiyonel kabul edilir (route içinde 1 varsayılır)", () => {
    expect(cartAddItemSchema.safeParse({ productId: "p1" }).success).toBe(true);
  });
  it("0 veya negatif miktar reddedilir", () => {
    expect(cartUpdateItemSchema.safeParse({ quantity: 0 }).success).toBe(false);
    expect(cartUpdateItemSchema.safeParse({ quantity: -1 }).success).toBe(false);
  });
  it("ondalıklı miktar reddedilir (tam sayı olmalı)", () => {
    expect(cartUpdateItemSchema.safeParse({ quantity: 1.5 }).success).toBe(false);
  });
});

describe("checkoutValidateSchema — FAZ 4B Test 8/12-16: teslimat yöntemi + client manipülasyonu", () => {
  it("PICKUP için addressId olmadan geçerlidir", () => {
    expect(checkoutValidateSchema.safeParse({ deliveryMethod: "PICKUP" }).success).toBe(true);
  });
  it("DELIVERY için addressId zorunludur", () => {
    expect(checkoutValidateSchema.safeParse({ deliveryMethod: "DELIVERY" }).success).toBe(false);
    expect(checkoutValidateSchema.safeParse({ deliveryMethod: "DELIVERY", addressId: "a1" }).success).toBe(true);
  });
  it("Test 8 — geçersiz deliveryMethod ('HACK') reddedilir", () => {
    expect(checkoutValidateSchema.safeParse({ deliveryMethod: "HACK", addressId: "a1" }).success).toBe(false);
  });
  it("Test 12-16 — client'ın gönderdiği price/subtotal/total/shippingPrice/quantity alanları şemada tanımlı olmadığı için sessizce elenir (istemcinin gönderdiği hiçbir manipülasyon route'a ulaşmaz)", () => {
    const parsed = checkoutValidateSchema.safeParse({
      deliveryMethod: "PICKUP",
      price: 1,
      subtotal: 1,
      total: 1,
      shippingPrice: 1,
      quantity: 999,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ deliveryMethod: "PICKUP", addressId: undefined });
      expect(parsed.data).not.toHaveProperty("price");
      expect(parsed.data).not.toHaveProperty("total");
      expect(parsed.data).not.toHaveProperty("quantity");
    }
  });
});
