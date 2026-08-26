import { prisma } from "@/lib/prisma";
import type { Category } from "@prisma/client";

// ==========================================================
// FAZ 2 — Bölüm 3/4/35 — Kategori Ağacı Yardımcıları
//
// Category.path bir "materialized path" tutar: "/<ata1Id>/.../<selfId>/".
// Bu, "bu kategori ve TÜM alt kategorileri" sorgusunu (kampanya kapsamı,
// toplu fiyat revizyonu, ürün filtreleme, admin ağaç görünümü için gerekli)
// recursive CTE'ye ihtiyaç duymadan, indexed bir `path LIKE 'prefix%'`
// sorgusuyla yanıtlamayı sağlar — SQLite'ta recursive CTE Prisma üzerinden
// doğal desteklenmiyor, bu yaklaşım hem daha basit hem 10.000+ ürün/kategori
// ölçeğinde performanslı (bkz. docs/catalog.md).
// ==========================================================

export function computePath(parent: Pick<Category, "path"> | null, selfId: string): string {
  const base = parent ? parent.path : "/";
  return `${base}${selfId}/`;
}

export interface CreateCategoryPlan {
  path: string;
  depth: number;
}

/** Yeni bir kategori oluşturulmadan önce parent'a göre path/depth hesaplar. */
export async function planCategoryCreate(parentId: string | null, selfId: string): Promise<CreateCategoryPlan> {
  if (!parentId) return { path: `/${selfId}/`, depth: 0 };
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) throw new Error("Geçersiz parentId");
  return { path: computePath(parent, selfId), depth: parent.depth + 1 };
}

/**
 * Bir kategoriyi yeni bir parent'ın altına taşır (veya köke taşımak için
 * newParentId=null). Kendi alt ağacına taşımayı (döngü) engeller ve
 * taşınan kategorinin TÜM alt ağacının path/depth değerlerini,
 * eski path önekini yenisiyle değiştirerek transaction içinde günceller.
 */
export async function moveCategory(categoryId: string, newParentId: string | null) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new Error("Kategori bulunamadı");

  if (newParentId === categoryId) {
    throw new Error("Bir kategori kendi parent'ı olamaz");
  }

  let newParent: Category | null = null;
  if (newParentId) {
    newParent = await prisma.category.findUnique({ where: { id: newParentId } });
    if (!newParent) throw new Error("Geçersiz parentId");
    // Döngü engeli: yeni parent, taşınan kategorinin bir alt kategorisi olamaz
    if (newParent.path.startsWith(category.path)) {
      throw new Error("Bir kategori kendi alt kategorisinin altına taşınamaz");
    }
  }

  const oldPath = category.path;
  const newPath = computePath(newParent, category.id);
  const depthDelta = (newParent ? newParent.depth + 1 : 0) - category.depth;

  const descendants = await prisma.category.findMany({ where: { path: { startsWith: oldPath } } });

  await prisma.$transaction(
    descendants.map((d) =>
      prisma.category.update({
        where: { id: d.id },
        data: {
          path: newPath + d.path.slice(oldPath.length),
          depth: d.depth + depthDelta,
          ...(d.id === categoryId ? { parentId: newParentId } : {}),
        },
      })
    )
  );
}

/** Bir kategorinin kendisi dahil tüm alt ağacındaki kategori id'lerini döner. */
export async function getCategorySubtreeIds(categoryId: string): Promise<string[]> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return [categoryId];
  const rows = await prisma.category.findMany({
    where: { path: { startsWith: category.path } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export interface CategoryTreeNode {
  id: string;
  slug: string;
  title: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  depth: number;
  productCount?: number;
  children: CategoryTreeNode[];
}

/** Düz kategori listesini (findMany sonucu) iç içe bir ağaca dönüştürür. */
export function buildCategoryTree(
  categories: (Category & { _count?: { products: number } })[]
): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const c of categories) {
    byId.set(c.id, {
      id: c.id,
      slug: c.slug,
      title: c.title,
      isActive: c.isActive,
      isFeatured: c.isFeatured,
      sortOrder: c.sortOrder,
      depth: c.depth,
      productCount: c._count?.products,
      children: [],
    });
  }
  const roots: CategoryTreeNode[] = [];
  for (const c of categories) {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "tr"));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}
