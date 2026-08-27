import { describe, it, expect } from "vitest";
import { verifyCronSecret } from "@/lib/cron-auth";

describe("cron-auth — verifyCronSecret", () => {
  it("doğru değer eşleşince true döner", () => {
    expect(verifyCronSecret("gizli-anahtar-123", "gizli-anahtar-123")).toBe(true);
  });

  it("yanlış değer false döner", () => {
    expect(verifyCronSecret("yanlis-deger", "gizli-anahtar-123")).toBe(false);
  });

  it("aynı uzunlukta ama farklı içerik false döner (timingSafeEqual yolu)", () => {
    expect(verifyCronSecret("abc1234567", "xyz1234567")).toBe(false);
  });

  it("beklenen değer tanımsızsa fail-closed false döner", () => {
    expect(verifyCronSecret("gizli-anahtar-123", undefined)).toBe(false);
  });

  it("beklenen değer boşsa fail-closed false döner", () => {
    expect(verifyCronSecret("gizli-anahtar-123", "")).toBe(false);
  });

  it("sağlanan değer null ise false döner", () => {
    expect(verifyCronSecret(null, "gizli-anahtar-123")).toBe(false);
  });

  it("uzunluk farklıysa güvenle false döner (throw etmez)", () => {
    expect(verifyCronSecret("kisa", "cok-daha-uzun-bir-deger")).toBe(false);
  });
});
