// ==========================================================
// FAZ 3 — Bölüm 2/7: Breadcrumb (ekmek kırıntısı) yardımcıları.
//
// Kategori ağacı zaten `/api/categories`'ten TEK bir düz liste olarak
// geliyor (7 kategori — küçük ölçek); ayrı bir API çağrısı yerine, bu SAF
// fonksiyon o düz listeyi alıp parentId zincirini kökten yaprağa doğru
// sıralı bir diziye çevirir. Birim testli (bkz. __tests__/breadcrumb.test.ts).
// ==========================================================

export interface BreadcrumbCategory {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
}

export interface BreadcrumbItem {
  label: string;
  href: string;
}

/**
 * Verilen kategori id'sinden köke kadar parentId zincirini izler ve
 * kökten yaprağa (soldan sağa) sıralı bir dizi döner. Döngü (bozuk veri)
 * durumunda sonsuz döngüye girmemek için ziyaret edilen id'ler izlenir.
 */
export function buildCategoryAncestorChain(
  categories: BreadcrumbCategory[],
  categoryId: string
): BreadcrumbCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chain: BreadcrumbCategory[] = [];
  const visited = new Set<string>();

  let current = byId.get(categoryId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/** Kategori sayfası için "Ana Sayfa / Ata1 / Ata2 / Bu Kategori" breadcrumb dizisi. */
export function buildCategoryBreadcrumb(
  categories: BreadcrumbCategory[],
  categoryId: string,
  homeLabel = "Ana Sayfa"
): BreadcrumbItem[] {
  const chain = buildCategoryAncestorChain(categories, categoryId);
  return [
    { label: homeLabel, href: "/" },
    ...chain.map((c) => ({ label: c.title, href: `/kategori/${c.slug}` })),
  ];
}

/** Ürün sayfası için "Ana Sayfa / ...Kategori Zinciri... / Ürün Adı" breadcrumb dizisi. */
export function buildProductBreadcrumb(
  categories: BreadcrumbCategory[],
  categoryId: string,
  productName: string,
  homeLabel = "Ana Sayfa"
): BreadcrumbItem[] {
  const categoryTrail = buildCategoryBreadcrumb(categories, categoryId, homeLabel);
  return [...categoryTrail, { label: productName, href: "#" }];
}
