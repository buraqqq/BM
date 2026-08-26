import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { importCommitSchema } from "@/lib/validation";
import { validateImportRows, summarizeImportRows, type ParsedImportRow } from "@/lib/import-products";
import { uniqueSlug } from "@/lib/slug";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { deriveStockStatus } from "@/lib/stock-status";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 100;

/**
 * Bölüm 23/24/38 — CSV İçe Aktarma: GERÇEK UYGULAMA.
 * POST /api/admin/import/commit  { rows, columnMapping, fileName? }
 *
 * ÖNEMLİ: Önizlemeye güvenmeden, gönderilen ham veriyi BURADA YENİDEN
 * doğrular (validateImportRows önizlemeyle birebir aynı fonksiyon) — bir
 * admin önizledikten sonra dosyayı değiştirip commit'i eski önizlemenin
 * onayına dayanarak çalıştıramaz.
 *
 * Büyük import'lar TEK dev bir transaction yerine BATCH_SIZE'lık (100
 * satır) parçalar halinde, her biri kendi transaction'ında uygulanır
 * (Bölüm 38 — 10.000+ satırlık bir import tek transaction'da kilit/timeout
 * riski taşır). Bir batch içindeki HERHANGİ bir satır beklenmeyen bir DB
 * hatasına düşerse yalnızca o batch geri alınır, önceki batch'ler kalıcıdır
 * — bu nedenle nihai rapor "başarılı/başarısız/güncellenen/yeni oluşturulan"
 * sayılarını satır satır, gerçek sonuca göre raporlar (asla "hepsi
 * başarılı" varsayılmaz).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = importCommitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { rows, columnMapping, fileName } = parsed.data;

  const [categories, brands, existingProducts] = await Promise.all([
    prisma.category.findMany({ select: { id: true, title: true } }),
    prisma.brand.findMany({ select: { id: true, name: true } }),
    prisma.product.findMany({ select: { id: true, sku: true, barcode: true, name: true } }),
  ]);

  const validated = validateImportRows(rows, columnMapping, { categories, brands, existingProducts });

  const importJob = await prisma.importJob.create({
    data: {
      fileName: fileName ?? "içe-aktarma.csv",
      status: "IMPORTING",
      totalRows: validated.length,
      columnMappingJson: JSON.stringify(columnMapping),
      createdByAdminId: auth.session.user.id,
    },
  });

  const usedSlugs = new Set<string>();
  const runtimeErrors: { row: number; message: string }[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  // Slug'ları BATCH'lemeden önce, tüm CREATE satırları için sırayla
  // hesaplıyoruz — aynı import dosyasındaki iki benzer isimli ürünün aynı
  // slug'a çarpmaması için (henüz DB'ye yazılmamış) yerel bir "kullanıldı"
  // kümesi de kontrol ediliyor.
  const slugByRow = new Map<number, string>();
  for (const row of validated) {
    if (row.action !== "CREATE" || !row.product) continue;
    const slug = await uniqueSlug(row.product.name, async (candidate) => {
      if (usedSlugs.has(candidate)) return true;
      const found = await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } });
      return !!found;
    });
    usedSlugs.add(slug);
    slugByRow.set(row.rowNumber, slug);
  }

  const applicableRows = validated.filter((r) => r.action !== "SKIP" && r.product);
  for (let i = 0; i < applicableRows.length; i += BATCH_SIZE) {
    const batch = applicableRows.slice(i, i + BATCH_SIZE);
    let batchCreated = 0;
    let batchUpdated = 0;
    try {
      await prisma.$transaction(async (tx) => {
        for (const row of batch) {
          const p = row.product!;
          if (row.action === "CREATE") {
            const slug = slugByRow.get(row.rowNumber)!;
            const stockStatus = deriveStockStatus(p.stock, p.minimumStock);
            const created = await tx.product.create({
              data: {
                name: p.name,
                sku: p.sku,
                barcode: p.barcode,
                slug,
                categoryId: p.categoryId,
                brandId: p.brandId,
                shortDescription: p.shortDescription,
                description: p.description,
                price: p.price,
                compareAtPrice: p.compareAtPrice,
                salePrice: p.salePrice,
                costPrice: p.costPrice,
                taxRate: p.taxRate,
                unit: p.unit,
                isActive: p.isActive,
                isFeatured: p.isFeatured,
                seoTitle: p.seoTitle,
                seoDescription: p.seoDescription,
                inventory: { create: { quantity: p.stock, lowStockThreshold: p.minimumStock, stockStatus } },
                priceHistory: { create: { field: "price", oldValue: null, newValue: p.price, reason: "csv-import", changedById: auth.session.user.id } },
              },
              include: { inventory: true },
            });
            // İlk stok hareketi: MIGRATION DEĞİL — bu admin'in bilinçli
            // olarak import ettiği bir sayı, bu yüzden "doğrulanmış" sayılır.
            if (created.inventory) {
              await tx.inventoryMovement.create({
                data: {
                  inventoryId: created.inventory.id,
                  type: p.stock > 0 ? "RESTOCK" : "ADJUSTMENT",
                  quantityChange: p.stock,
                  resultingQuantity: p.stock,
                  reason: "CSV içe aktarma — ilk stok girişi",
                  createdByAdminId: auth.session.user.id,
                },
              });
            }
            batchCreated += 1;
          } else if (row.action === "UPDATE" && row.existingProductId) {
            const existingInventory = await tx.inventory.findUnique({ where: { productId: row.existingProductId } });
            const stockStatus = deriveStockStatus(p.stock, p.minimumStock);
            await tx.product.update({
              where: { id: row.existingProductId },
              data: {
                name: p.name,
                barcode: p.barcode,
                categoryId: p.categoryId,
                brandId: p.brandId,
                shortDescription: p.shortDescription,
                description: p.description,
                price: p.price,
                compareAtPrice: p.compareAtPrice,
                salePrice: p.salePrice,
                costPrice: p.costPrice,
                taxRate: p.taxRate,
                unit: p.unit,
                isActive: p.isActive,
                isFeatured: p.isFeatured,
                seoTitle: p.seoTitle,
                seoDescription: p.seoDescription,
              },
            });
            if (existingInventory) {
              const delta = p.stock - existingInventory.quantity;
              await tx.inventory.update({
                where: { productId: row.existingProductId },
                data: { quantity: p.stock, lowStockThreshold: p.minimumStock, stockStatus },
              });
              if (delta !== 0) {
                await tx.inventoryMovement.create({
                  data: {
                    inventoryId: existingInventory.id,
                    type: "ADJUSTMENT",
                    quantityChange: delta,
                    resultingQuantity: p.stock,
                    reason: "CSV içe aktarma — stok güncelleme",
                    createdByAdminId: auth.session.user.id,
                  },
                });
              }
            }
            batchUpdated += 1;
          }
        }
      });
      // Transaction başarıyla COMMIT edildi — yalnızca bu noktada global
      // sayaçlara ekliyoruz. Böylece bir batch'in ortasında atılan bir
      // hata, önceki satırlar için yanlışlıkla "başarılı" sayılmış bir
      // sayaç artışı bırakmaz (rollback ile DB zaten tutarlı, sayaç da
      // DB ile birebir tutarlı kalır).
      createdCount += batchCreated;
      updatedCount += batchUpdated;
    } catch (err) {
      // Bu batch'teki TÜM satırlar geri alındı (transaction rollback) —
      // önceki batch'ler kalıcı kalır, bu batch'e ait hiçbir sayaç
      // artırılmadı (yukarıdaki createdCount/updatedCount += satırlarına
      // hiç ulaşılmadı), bu yüzden burada geri alınacak bir şey yok.
      const message = err instanceof Error ? err.message : "Bilinmeyen veritabanı hatası";
      for (const row of batch) runtimeErrors.push({ row: row.rowNumber, message });
    }
  }

  const skippedRows = validated.filter((r) => r.action === "SKIP");
  const failedRuntimeRowNumbers = new Set(runtimeErrors.map((e) => e.row));
  const successCount = createdCount + updatedCount;
  const errorCount = skippedRows.length + failedRuntimeRowNumbers.size;

  const errorsJson = [
    ...skippedRows.map((r) => ({ row: r.rowNumber, message: r.errors.join("; ") })),
    ...runtimeErrors,
  ];

  await prisma.importJob.update({
    where: { id: importJob.id },
    data: {
      status: "COMPLETED",
      successCount,
      errorCount,
      createdCount,
      updatedCount,
      errorsJson: errorsJson.length > 0 ? JSON.stringify(errorsJson) : null,
      finishedAt: new Date(),
    },
  });

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "PRODUCT_IMPORT",
    entity: "ImportJob",
    entityId: importJob.id,
    ipAddress: getClientIp(req),
    metadata: { fileName: fileName ?? null, totalRows: validated.length, createdCount, updatedCount, errorCount },
  });

  const rowsReport: (ParsedImportRow & { runtimeError?: string })[] = validated.map((r) => {
    const runtimeErr = runtimeErrors.find((e) => e.row === r.rowNumber);
    return runtimeErr ? { ...r, runtimeError: runtimeErr.message } : r;
  });

  return NextResponse.json({
    importJobId: importJob.id,
    summary: { ...summarizeImportRows(validated), successCount, errorCount, createdCount, updatedCount },
    rows: rowsReport,
  });
}
