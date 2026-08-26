// ==========================================================
// FAZ 5 — Affiliate (gelir ortaklığı) ürün örnekleri seed'i.
//
// Bunlar, iç envanterde OLMAYAN ama tasarımın tamamlayıcısı olan ürünleri
// temsil eden ÖRNEK kayıtlardır. `vendor`/`affiliateUrl` bilinçli olarak
// placeholder'dır — gerçek partner bağlantıları admin tarafından girilecek/
// güncellenecek (bu tablo Product baseline'ını etkilemez, ayrı tablo).
//
// Çalıştırma: npx tsx prisma/seed-affiliate.ts
// ==========================================================
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SAMPLE: { name: string; vendor: string; category: string; estimatedPrice: number }[] = [
  // bitki
  { name: "Lavanta (Saksıda)", vendor: "Partner Örneği", category: "bitki", estimatedPrice: 120 },
  { name: "Biberiye Fidesi", vendor: "Partner Örneği", category: "bitki", estimatedPrice: 40 },
  { name: "Genç Zeytin Ağacı", vendor: "Partner Örneği", category: "bitki", estimatedPrice: 450 },
  { name: "Begonya (Renkli)", vendor: "Partner Örneği", category: "bitki", estimatedPrice: 75 },
  { name: "Sukulent Karışımı (6'lı)", vendor: "Partner Örneği", category: "bitki", estimatedPrice: 160 },
  // toprak
  { name: "Bahçe Toprağı 50L", vendor: "Partner Örneği", category: "toprak", estimatedPrice: 220 },
  { name: "Saksı Torfu 40L", vendor: "Partner Örneği", category: "toprak", estimatedPrice: 190 },
  // saksi
  { name: "Seramik Saksı 30cm", vendor: "Partner Örneği", category: "saksi", estimatedPrice: 260 },
  { name: "Kendinden Sulamalı Saksı", vendor: "Partner Örneği", category: "saksi", estimatedPrice: 320 },
  // sulama
  { name: "Otomatik Sulama Zamanlayıcısı", vendor: "Partner Örneği", category: "sulama", estimatedPrice: 480 },
  { name: "Damla Sulama Kiti", vendor: "Partner Örneği", category: "sulama", estimatedPrice: 350 },
  // mobilya
  { name: "Bahçe Oturma Grubu (2'li)", vendor: "Partner Örneği", category: "mobilya", estimatedPrice: 4500 },
  { name: "Rattan Şezlong", vendor: "Partner Örneği", category: "mobilya", estimatedPrice: 2800 },
  // aydinlatma
  { name: "Solar Bahçe Aydınlatma Seti", vendor: "Partner Örneği", category: "aydinlatma", estimatedPrice: 520 },
  // gubre
  { name: "Organik Gübre 5kg", vendor: "Partner Örneği", category: "gubre", estimatedPrice: 210 },
  // alet
  { name: "Bahçe El Aletleri Seti", vendor: "Partner Örneği", category: "alet", estimatedPrice: 390 },
];

async function main() {
  const existing = await prisma.affiliateProduct.count();
  if (existing > 0) {
    console.log(`Affiliate ürünleri zaten mevcut (${existing}) — atlandı.`);
    return;
  }

  for (const item of SAMPLE) {
    await prisma.affiliateProduct.create({
      data: {
        name: item.name,
        vendor: item.vendor,
        category: item.category,
        estimatedPrice: item.estimatedPrice,
        affiliateUrl: `https://partner.example.com/p/${item.category}/${encodeURIComponent(item.name.toLowerCase().replace(/\s+/g, "-"))}`,
        isActive: true,
      },
    });
  }
  console.log(`${SAMPLE.length} affiliate ürün eklendi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
