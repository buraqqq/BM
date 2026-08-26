/**
 * FAZ 3.1 — Bölüm 4: gerçek storefront veri testi.
 *
 * Kontrollü, geçici test verisi oluşturur (2 normal + 2 kampanyalı/indirimli
 * ürün), gerçek çalışan /api/products?sort=price_asc endpoint'ine karşı
 * final fiyat sıralamasını doğrular, SONUNDA test verisini SİLER.
 * Production veriye kalıcı hiçbir iz bırakmaz.
 *
 * Çalıştırma: dev server ayrı bir terminalde/arka planda çalışırken:
 *   npx tsx scripts/faz31-price-sort-live-check.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function main() {
  const category = await prisma.category.findFirst({ where: { isActive: true } });
  if (!category) throw new Error("Test için aktif kategori bulunamadı");

  console.log("1) Geçici test ürünleri oluşturuluyor...");
  const [d, a, b, c] = await Promise.all([
    prisma.product.create({
      data: { sku: "TEST-FAZ31-D", name: "TEST-FAZ31 D Ürünü", slug: "test-faz31-d-urunu", categoryId: category.id, price: 100, isActive: true, taxRate: 20 },
    }),
    prisma.product.create({
      data: { sku: "TEST-FAZ31-A", name: "TEST-FAZ31 A Ürünü", slug: "test-faz31-a-urunu", categoryId: category.id, price: 1000, salePrice: 700, isActive: true, taxRate: 20 },
    }),
    prisma.product.create({
      data: { sku: "TEST-FAZ31-B", name: "TEST-FAZ31 B Ürünü", slug: "test-faz31-b-urunu", categoryId: category.id, price: 750, isActive: true, taxRate: 20 },
    }),
    prisma.product.create({
      data: { sku: "TEST-FAZ31-C", name: "TEST-FAZ31 C Ürünü", slug: "test-faz31-c-urunu", categoryId: category.id, price: 1200, isActive: true, taxRate: 20 },
    }),
  ]);

  console.log("2) Geçici aktif kampanya oluşturuluyor (C ürününe %30, PRODUCT kapsamlı)...");
  const campaign = await prisma.campaign.create({
    data: {
      name: "TEST-FAZ31 Kampanya",
      slug: "test-faz31-kampanya",
      discountType: "PERCENTAGE",
      discountValue: 30,
      scope: "PRODUCT",
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
      isActive: true,
    },
  });
  const campaignProduct = await prisma.campaignProduct.create({ data: { campaignId: campaign.id, productId: c.id } });

  console.log("Beklenen final fiyatlar: D=100, A=700 (salePrice), B=750, C=840 (1200*0.7)");
  console.log("Beklenen ASC sıra: D, A, B, C");
  console.log("Beklenen DESC sıra: C, B, A, D");

  let ascOk = false;
  let descOk = false;
  try {
    console.log("\n3) Gerçek /api/products?sort=price_asc endpoint'i çağrılıyor...");
    const ascRes = await fetch(`${BASE_URL}/api/products?search=TEST-FAZ31&sort=price_asc&pageSize=20`, { cache: "no-store" });
    const ascJson = await ascRes.json();
    const ascSkus = ascJson.items.map((i: { sku: string }) => i.sku);
    const ascPrices = ascJson.items.map((i: { price: { final: number } }) => i.price.final);
    console.log("ASC sonucu:", ascSkus, ascPrices);
    ascOk = JSON.stringify(ascSkus) === JSON.stringify(["TEST-FAZ31-D", "TEST-FAZ31-A", "TEST-FAZ31-B", "TEST-FAZ31-C"]);

    console.log("\n4) Gerçek /api/products?sort=price_desc endpoint'i çağrılıyor...");
    const descRes = await fetch(`${BASE_URL}/api/products?search=TEST-FAZ31&sort=price_desc&pageSize=20`, { cache: "no-store" });
    const descJson = await descRes.json();
    const descSkus = descJson.items.map((i: { sku: string }) => i.sku);
    const descPrices = descJson.items.map((i: { price: { final: number } }) => i.price.final);
    console.log("DESC sonucu:", descSkus, descPrices);
    descOk = JSON.stringify(descSkus) === JSON.stringify(["TEST-FAZ31-C", "TEST-FAZ31-B", "TEST-FAZ31-A", "TEST-FAZ31-D"]);
  } finally {
    console.log("\n5) Geçici test verisi temizleniyor (kalıcı bırakılmıyor)...");
    await prisma.campaignProduct.delete({ where: { id: campaignProduct.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    await prisma.product.deleteMany({ where: { id: { in: [d.id, a.id, b.id, c.id] } } });
    console.log("Temizlendi.");
  }

  console.log("\n=== SONUÇ ===");
  console.log("ASC doğru mu:", ascOk);
  console.log("DESC doğru mu:", descOk);
  if (!ascOk || !descOk) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
