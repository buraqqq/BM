import { describe, it, expect } from "vitest";
import { isCurrentlyActiveByDateRange } from "@/lib/date-range-active";

// Bölüm 26 — "banner date logic" testi (Campaign için de aynı fonksiyon kullanılır).

describe("isCurrentlyActiveByDateRange", () => {
  const now = new Date("2026-08-26T12:00:00Z");

  it("tarih aralığı içindeyse ve aktifse true döner", () => {
    const start = new Date("2026-08-20T00:00:00Z");
    const end = new Date("2026-09-05T23:59:59Z");
    expect(isCurrentlyActiveByDateRange(now, start, end, true)).toBe(true);
  });

  it("başlangıç tarihi henüz gelmediyse false döner", () => {
    const start = new Date("2026-09-01T00:00:00Z");
    const end = new Date("2026-09-05T23:59:59Z");
    expect(isCurrentlyActiveByDateRange(now, start, end, true)).toBe(false);
  });

  it("bitiş tarihi geçtiyse false döner (Bölüm 20 — Test 6)", () => {
    const start = new Date("2026-08-01T00:00:00Z");
    const end = new Date("2026-08-25T23:59:59Z");
    expect(isCurrentlyActiveByDateRange(now, start, end, true)).toBe(false);
  });

  it("tarih aralığı içinde olsa bile isActive=false ise false döner (manuel kapatma anahtarı)", () => {
    const start = new Date("2026-08-01T00:00:00Z");
    const end = new Date("2026-09-05T23:59:59Z");
    expect(isCurrentlyActiveByDateRange(now, start, end, false)).toBe(false);
  });

  it("sınır anları (tam başlangıç / tam bitiş) dahil kabul edilir", () => {
    expect(isCurrentlyActiveByDateRange(now, now, new Date(now.getTime() + 1000), true)).toBe(true);
    expect(isCurrentlyActiveByDateRange(now, new Date(now.getTime() - 1000), now, true)).toBe(true);
  });
});
