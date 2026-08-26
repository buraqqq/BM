/**
 * FAZ 2.1 — Bölüm 7: Database Integrity Check.
 *
 * Prisma + SQLite'ta gerçek foreign key enforcement aktif olduğu için normal
 * yollardan (Prisma client) yazılan veride "orphan" (ebeveyni olmayan) satır
 * OLUŞAMAZ — bu script yine de savunma amaçlı, tüm ilişkileri id-küme
 * karşılaştırmasıyla ve @unique alanları tarar. Hiçbir veriyi DEĞİŞTİRMEZ,
 * yalnızca okur ve raporlar. Sıfır bulgu bekleniyor; çıktı 0 değilse gerçek
 * bir veri bütünlüğü sorunu var demektir.
 *
 * Çalıştırma: npx tsx scripts/db-integrity-check.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function findMissingRefs<T extends Record<string, unknown>>(
  rows: T[],
  fkField: keyof T,
  validIds: Set<string>,
  labelField: keyof T = fkField
): string[] {
  return rows
    .filter((r) => r[fkField] !== null && r[fkField] !== undefined && !validIds.has(r[fkField] as string))
    .map((r) => `${String(r[labelField])} -> ${String(r[fkField])}`);
}

function findDuplicates<T extends Record<string, unknown>>(rows: T[], field: keyof T): string[] {
  const seen = new Map<unknown, number>();
  for (const r of rows) {
    if (r[field] === null || r[field] === undefined) continue;
    seen.set(r[field], (seen.get(r[field]) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([val, count]) => `${String(val)} (${count}x)`);
}

async function main() {
  const findings: string[] = [];

  const productIds = new Set((await prisma.product.findMany({ select: { id: true } })).map((p) => p.id));
  const categoryIds = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
  const brandIds = new Set((await prisma.brand.findMany({ select: { id: true } })).map((b) => b.id));
  const campaignIds = new Set((await prisma.campaign.findMany({ select: { id: true } })).map((c) => c.id));
  const inventoryIds = new Set((await prisma.inventory.findMany({ select: { id: true } })).map((i) => i.id));
  const attributeDefIds = new Set((await prisma.productAttributeDefinition.findMany({ select: { id: true } })).map((a) => a.id));

  // --- Orphan ilişkiler: id-küme karşılaştırması (gerçek FK zaten engelliyor, bu doğrulama amaçlı) ---
  const images = await prisma.productImage.findMany({ select: { id: true, productId: true } });
  findMissingRefs(images, "productId", productIds, "id").forEach((f) => findings.push(`orphan ProductImage: ${f}`));

  const inventories = await prisma.inventory.findMany({ select: { id: true, productId: true } });
  findMissingRefs(inventories, "productId", productIds, "id").forEach((f) => findings.push(`orphan Inventory: ${f}`));

  const movements = await prisma.inventoryMovement.findMany({ select: { id: true, inventoryId: true } });
  findMissingRefs(movements, "inventoryId", inventoryIds, "id").forEach((f) => findings.push(`orphan InventoryMovement: ${f}`));

  const campaignProducts = await prisma.campaignProduct.findMany({ select: { id: true, productId: true, campaignId: true } });
  findMissingRefs(campaignProducts, "productId", productIds, "id").forEach((f) => findings.push(`orphan CampaignProduct (productId): ${f}`));
  findMissingRefs(campaignProducts, "campaignId", campaignIds, "id").forEach((f) => findings.push(`orphan CampaignProduct (campaignId): ${f}`));

  const priceHistory = await prisma.priceHistory.findMany({ select: { id: true, productId: true } });
  findMissingRefs(priceHistory, "productId", productIds, "id").forEach((f) => findings.push(`orphan PriceHistory: ${f}`));

  const attrValues = await prisma.productAttributeValue.findMany({ select: { id: true, productId: true, attributeDefinitionId: true } });
  findMissingRefs(attrValues, "productId", productIds, "id").forEach((f) => findings.push(`orphan ProductAttributeValue (productId): ${f}`));
  findMissingRefs(attrValues, "attributeDefinitionId", attributeDefIds, "id").forEach((f) => findings.push(`orphan ProductAttributeValue (attributeDefinitionId): ${f}`));

  const productsWithBrand = await prisma.product.findMany({ where: { brandId: { not: null } }, select: { id: true, sku: true, brandId: true } });
  findMissingRefs(productsWithBrand, "brandId", brandIds, "sku").forEach((f) => findings.push(`orphan Brand relation (Product.brandId): ${f}`));

  const allProductRefs = await prisma.product.findMany({ select: { id: true, sku: true, categoryId: true } });
  findMissingRefs(allProductRefs, "categoryId", categoryIds, "sku").forEach((f) => findings.push(`orphan Category relation (Product.categoryId): ${f}`));

  // --- Duplicate kontrolü (@unique zaten DB'de garanti ediyor, doğrulama amaçlı) ---
  const allProducts = await prisma.product.findMany({ select: { sku: true, barcode: true, slug: true } });
  findDuplicates(allProducts, "sku").forEach((d) => findings.push(`duplicate SKU: ${d}`));
  findDuplicates(allProducts, "barcode").forEach((d) => findings.push(`duplicate barcode: ${d}`));
  findDuplicates(allProducts, "slug").forEach((d) => findings.push(`duplicate slug: ${d}`));

  const allCategories = await prisma.category.findMany({ select: { slug: true } });
  findDuplicates(allCategories, "slug").forEach((d) => findings.push(`duplicate Category slug: ${d}`));

  // --- Özet ---
  const counts = {
    products: await prisma.product.count(),
    activeProducts: await prisma.product.count({ where: { isActive: true } }),
    categories: await prisma.category.count(),
    brands: await prisma.brand.count(),
    inventories: await prisma.inventory.count(),
    inventoryMovements: await prisma.inventoryMovement.count(),
    priceHistory: await prisma.priceHistory.count(),
    campaignProducts: await prisma.campaignProduct.count(),
    productImages: await prisma.productImage.count(),
  };

  console.log("=== DB Integrity Check ===");
  console.log("Sayılar:", JSON.stringify(counts, null, 2));
  if (findings.length === 0) {
    console.log("✅ Hiçbir bütünlük sorunu bulunamadı (0 orphan, 0 duplicate).");
  } else {
    console.log(`⚠ ${findings.length} bulgu:`);
    for (const f of findings) console.log(" -", f);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
