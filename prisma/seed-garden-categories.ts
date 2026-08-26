// ==========================================================
// FAZ 5 — Bahçe Market katalog genişletme: yeni KATEGORİLER.
//
// AI Garden Designer'ın "Canlı Bitki, Tohum, Sulama, Hortum, Saksı, Toprak/
// Gübre, Bahçe Aletleri" bileşenlerini iç envanterle eşleştirebilmesi için bu
// kategoriler şemaya eklenir. Ürünler (Product) EKLENMEZ — 257 aktif / 260
// toplam ürün baseline'ı korunur; kategoriler boş açılır ve admin tarafından
// doldurulur. Böylece motor, bu kategorilerde ürün yoksa otomatik olarak
// affiliate'e düşer (bkz. ai-designer-logic.ts).
//
// Çalıştırma: npx tsx prisma/seed-garden-categories.ts
// ==========================================================
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES: { slug: string; title: string; icon: string }[] = [
  { slug: "bitki", title: "Canlı Bitkiler & Ağaçlar", icon: "fa-seedling" },
  { slug: "tohum", title: "Sebze & Çiçek Tohumları", icon: "fa-seedling" },
  { slug: "sulama", title: "Sulama & Damlama Sistemleri", icon: "fa-droplet" },
  { slug: "hortum", title: "Hortumlar & Bağlantı", icon: "fa-faucet" },
  { slug: "saksi", title: "Saksılar & Saksı Altlığı", icon: "fa-basket-shopping" },
  { slug: "toprak-gubre", title: "Toprak & Gübre", icon: "fa-mound" },
  { slug: "alet", title: "Bahçe Aletleri", icon: "fa-screwdriver-wrench" },
];

async function main() {
  let created = 0;
  for (const c of CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { slug: c.slug } });
    if (existing) continue;
    const cat = await prisma.category.create({
      data: { slug: c.slug, title: c.title, icon: c.icon, isActive: true, sortOrder: 100, path: "/" },
    });
    // materialized path: kök kategori için "/<id>/"
    await prisma.category.update({ where: { id: cat.id }, data: { path: `/${cat.id}/` } });
    created++;
  }
  console.log(`${created} yeni bahçe kategorisi eklendi (toplam ${await prisma.category.count()}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
