import { describe, it, expect } from "vitest";
import { computePath } from "@/lib/category-tree";

// Bölüm 3/4/35 — materialized path hesaplama. moveCategory/getCategorySubtreeIds
// DB'ye bağımlı olduğu için (Prisma) burada test edilmiyor — canlı sisteme
// karşı admin UI üzerinden (kategori taşıma, toplu fiyat/kampanya kapsamı)
// doğrulandı; computePath saf bir fonksiyon olduğu için birim testle
// doğrudan kapsanıyor.
describe("computePath", () => {
  it("kök seviyede (parent yok) path'i /selfId/ olarak üretir", () => {
    expect(computePath(null, "cat-bahce")).toBe("/cat-bahce/");
  });

  it("bir üst kategorinin path'ine kendi id'sini ekler", () => {
    const parent = { path: "/cat-bahce/" };
    expect(computePath(parent, "cat-sulama")).toBe("/cat-bahce/cat-sulama/");
  });

  it("üç seviyeli bir hiyerarşide path doğru birikir (Bahçe > Sulama > Hortum)", () => {
    const level1 = computePath(null, "cat-bahce");
    const level2 = computePath({ path: level1 }, "cat-sulama");
    const level3 = computePath({ path: level2 }, "cat-hortum");
    expect(level3).toBe("/cat-bahce/cat-sulama/cat-hortum/");
    // Bölüm 35 — subtree sorgusu bu path'e LIKE 'prefix%' ile bakıyor;
    // her üst seviyenin path'i, alt seviyenin path'inin bir öneki olmalı.
    expect(level3.startsWith(level2)).toBe(true);
    expect(level2.startsWith(level1)).toBe(true);
  });
});
