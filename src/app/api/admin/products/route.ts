import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { productCreateSchema } from "@/lib/validation";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { decimalToNumber } from "@/lib/serialize";
import { uniqueSlug } from "@/lib/slug";
import { getCategorySubtreeIds } from "@/lib/category-tree";
import { checkDuplicates } from "@/lib/duplicate-check";

export const dynamic = "force-dynamic";

// Bölüm 10/35/36 — toplu ürün yönetimi: arama (isim/SKU/barkod), kategori
// (+alt kategoriler)/marka/stok/aktiflik/fiyat aralığı filtresi,
// server-side pagination (Bölüm 35 — 10.000+ ürün hedefi).
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  const categoryId = searchParams.get("categoryId") ?? undefined;
  const brandId = searchParams.get("brandId") ?? undefined;
  const activeParam = searchParams.get("active"); // "true" | "false" | null(=all)
  const stockParam = searchParams.get("stock"); // "in" | "low" | "out"
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? 50)));

  const where: Record<string, unknown> = {};
  if (categoryId) {
    // Bölüm 3: kategori filtresi seçilen kategori + tüm alt kategorilerini kapsar.
    const subtreeIds = await getCategorySubtreeIds(categoryId);
    where.categoryId = { in: subtreeIds };
  }
  if (brandId) where.brandId = brandId;
  if (activeParam === "true") where.isActive = true;
  if (activeParam === "false") where.isActive = false;
  if (search) {
    where.OR = [{ name: { contains: search } }, { sku: { contains: search } }, { barcode: { contains: search } }];
  }
  if (minPrice || maxPrice) {
    where.price = {
      ...(minPrice ? { gte: Number(minPrice) } : {}),
      ...(maxPrice ? { lte: Number(maxPrice) } : {}),
    };
  }
  if (stockParam) {
    where.inventory = { stockStatus: stockParam === "in" ? "IN_STOCK" : stockParam === "low" ? "LOW_STOCK" : "OUT_OF_STOCK" };
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, brand: true, inventory: true },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((p) =>
      decimalToNumber(
        {
          ...p,
          category: p.category,
          stock: p.inventory?.quantity ?? 0,
          stockStatus: p.inventory?.stockStatus ?? "IN_STOCK",
        },
        ["price", "compareAtPrice", "salePrice", "costPrice", "taxRate"]
      )
    ),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}

// Bölüm 9 — CREATE PRODUCT
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!category) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Geçersiz categoryId" }, { status: 400 });
  }

  const slug = await uniqueSlug(data.name, async (c) => !!(await prisma.product.findUnique({ where: { slug: c } })));
  const sku =
    data.sku ??
    (await (async () => {
      const count = await prisma.product.count({ where: { categoryId: data.categoryId } });
      return `BM-${category.slug.toUpperCase()}-${String(count + 1).padStart(3, "0")}`;
    })());

  const existingSku = await prisma.product.findUnique({ where: { sku } });
  if (existingSku) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: `SKU zaten kullanılıyor: ${sku}` }, { status: 400 });
  }

  // Bölüm 27 — deterministik duplicate uyarısı (hard block değil): aynı
  // kategorideki ürünlerle isim benzerliği / barkod çakışması kontrol edilir.
  const sameCategoryProducts = await prisma.product.findMany({
    where: { categoryId: data.categoryId },
    select: { id: true, name: true, sku: true, barcode: true },
    take: 2000,
  });
  const duplicateWarnings = checkDuplicates({ name: data.name, sku, barcode: data.barcode }, sameCategoryProducts);

  const product = await prisma.product.create({
    data: {
      name: data.name,
      sku,
      barcode: data.barcode ?? null,
      slug,
      categoryId: data.categoryId,
      brandId: data.brandId ?? null,
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      price: data.price,
      compareAtPrice: data.compareAtPrice ?? null,
      salePrice: data.salePrice ?? null,
      costPrice: data.costPrice ?? null,
      taxRate: data.taxRate ?? 20,
      unit: data.unit ?? "ADET",
      weight: data.weight ?? null,
      isActive: data.isActive ?? true,
      isFeatured: data.isFeatured ?? false,
      seoTitle: data.seoTitle ?? null,
      seoDescription: data.seoDescription ?? null,
      inventory: {
        create: {
          quantity: data.stock ?? 0,
          ...(data.minimumStock !== undefined ? { lowStockThreshold: data.minimumStock } : {}),
        },
      },
      priceHistory: { create: { field: "price", oldValue: null, newValue: data.price, reason: "create", changedById: auth.session.user.id } },
      ...(data.attributes && data.attributes.length > 0
        ? { attributeValues: { create: data.attributes.map((a) => ({ attributeDefinitionId: a.attributeDefinitionId, value: a.value })) } }
        : {}),
    },
    include: { category: true, inventory: true },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "PRODUCT_CREATE",
    entity: "Product",
    entityId: product.id,
    ipAddress: getClientIp(req),
    metadata: { name: product.name, sku: product.sku, price: data.price },
  });

  return NextResponse.json(
    { ...decimalToNumber({ ...product }, ["price", "compareAtPrice", "salePrice", "costPrice", "taxRate"]), duplicateWarnings },
    { status: 201 }
  );
}
