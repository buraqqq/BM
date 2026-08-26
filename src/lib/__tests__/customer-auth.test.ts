import { describe, it, expect } from "vitest";
import { normalizeEmail, validatePasswordStrength, fullName, MIN_PASSWORD_LENGTH } from "@/lib/customer-auth";

// FAZ 4A — Bölüm 33 AUTH senaryolarının saf (DB'siz) kısmı. Gerçek DB'ye
// bağlı senaryolar (duplicate email 409, login success/failure, unauthorized
// profile access) scripts/faz4a-commerce-e2e-check.ts'te gerçek HTTP
// çağrılarıyla doğrulanıyor (bkz. FAZ4A raporu Bölüm Q) — price-sort.ts'in
// FAZ3.1'de kurduğu "saf mantık burada, DB entegrasyonu ayrı bir E2E
// script'te" deseniyle tutarlı.

describe("normalizeEmail", () => {
  it("büyük/küçük harf farkını normalize eder", () => {
    expect(normalizeEmail("Ali@Example.com")).toBe("ali@example.com");
  });
  it("baş/son boşlukları temizler", () => {
    expect(normalizeEmail("  ali@example.com  ")).toBe("ali@example.com");
  });
});

describe("validatePasswordStrength", () => {
  it(`en az ${MIN_PASSWORD_LENGTH} karakter şartını uygular`, () => {
    expect(validatePasswordStrength("ab1").ok).toBe(false);
  });
  it("yalnızca harf içeren (rakamsız) şifreyi reddeder", () => {
    expect(validatePasswordStrength("abcdefgh").ok).toBe(false);
  });
  it("yalnızca rakam içeren şifreyi reddeder", () => {
    expect(validatePasswordStrength("12345678").ok).toBe(false);
  });
  it("harf+rakam içeren yeterli uzunluktaki şifreyi kabul eder", () => {
    expect(validatePasswordStrength("sifre1234").ok).toBe(true);
  });
  it("Türkçe karakter içeren şifreyi de harf olarak sayar", () => {
    expect(validatePasswordStrength("şifrem123").ok).toBe(true);
  });
});

describe("fullName", () => {
  it("ad ve soyadı birleştirir", () => {
    expect(fullName("Ali", "Veli")).toBe("Ali Veli");
  });
  it("soyad boşsa yalnızca adı döner (kırılmaz)", () => {
    expect(fullName("Ali", null)).toBe("Ali");
    expect(fullName("Ali", undefined)).toBe("Ali");
  });
});
