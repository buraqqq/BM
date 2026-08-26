// FAZ 5 — ek affiliate kategorileri (tohum/hortum/cim) için tamamlayıcı seed.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXTRA = [
  { name: "Domates Tohumu Paketi", category: "tohum", estimatedPrice: 45 },
  { name: "Çiçek Tohumu Karışımı", category: "tohum", estimatedPrice: 65 },
  { name: "Bahçe Hortumu 15m", category: "hortum", estimatedPrice: 380 },
  { name: "Suni Çim Rulosu 1x2m", category: "cim", estimatedPrice: 290 },
];

async function main() {
  for (const item of EXTRA) {
    const existing = await prisma.affiliateProduct.findFirst({ where: { category: item.category } });
    if (existing) continue;
    await prisma.affiliateProduct.create({
      data: {
        name: item.name,
        vendor: "Partner Örneği",
        category: item.category,
        estimatedPrice: item.estimatedPrice,
        affiliateUrl: `https://partner.example.com/p/${item.category}`,
        isActive: true,
      },
    });
  }
  console.log(`affiliate ek tamamlandı (toplam ${await prisma.affiliateProduct.count()}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
