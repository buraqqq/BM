import { describe, it, expect } from "vitest";
import { buildCategoryAncestorChain, buildCategoryBreadcrumb, buildProductBreadcrumb } from "@/lib/breadcrumb";

const CATEGORIES = [
  { id: "a", slug: "bahce", title: "Bahçe", parentId: null },
  { id: "b", slug: "sulama", title: "Sulama", parentId: "a" },
  { id: "c", slug: "hortum", title: "Hortum", parentId: "b" },
  { id: "d", slug: "izole", title: "İzole (parentId yok kategoriler listesinde)", parentId: "yok" },
];

describe("buildCategoryAncestorChain", () => {
  it("kök kategori için tek elemanlı zincir döner", () => {
    expect(buildCategoryAncestorChain(CATEGORIES, "a")).toEqual([CATEGORIES[0]]);
  });

  it("üç seviyeli bir hiyerarşide kökten yaprağa sıralı zincir üretir (A > B > C)", () => {
    const chain = buildCategoryAncestorChain(CATEGORIES, "c");
    expect(chain.map((c) => c.slug)).toEqual(["bahce", "sulama", "hortum"]);
  });

  it("olmayan bir id için boş dizi döner", () => {
    expect(buildCategoryAncestorChain(CATEGORIES, "yok-boyle-id")).toEqual([]);
  });

  it("parentId listede bulunamayan (bozuk veri) bir kategoriyi kendisiyle sınırlı bırakır, sonsuz döngüye girmez", () => {
    const chain = buildCategoryAncestorChain(CATEGORIES, "d");
    expect(chain.map((c) => c.slug)).toEqual(["izole"]);
  });
});

describe("buildCategoryBreadcrumb", () => {
  it("Ana Sayfa + tüm ata kategorileri + kendisini içerir", () => {
    const trail = buildCategoryBreadcrumb(CATEGORIES, "c");
    expect(trail).toEqual([
      { label: "Ana Sayfa", href: "/" },
      { label: "Bahçe", href: "/kategori/bahce" },
      { label: "Sulama", href: "/kategori/sulama" },
      { label: "Hortum", href: "/kategori/hortum" },
    ]);
  });
});

describe("buildProductBreadcrumb", () => {
  it("kategori zincirinin sonuna ürün adını ekler (link'siz — href '#')", () => {
    const trail = buildProductBreadcrumb(CATEGORIES, "b", "Yeşil Hortum 25m");
    expect(trail).toEqual([
      { label: "Ana Sayfa", href: "/" },
      { label: "Bahçe", href: "/kategori/bahce" },
      { label: "Sulama", href: "/kategori/sulama" },
      { label: "Yeşil Hortum 25m", href: "#" },
    ]);
  });
});
