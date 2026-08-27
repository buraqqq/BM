// ==========================================================
// FAZ 7 — Bahçe kategorileri ürün veri seti (32 iç ürün + 20 affiliate).
//
// İç ürünler: 7 yeni bahçe kategorisi + mevcut cim/dekorasyon kategorilerine
// eklenir (SKU: BM-BAHCE-XXX, stoklu, gerçek fiyatlı). Affiliate ürünler:
// Trendyol / Hepsiburada / Amazon.com.tr satıcı adları, komisyon oranı ve
// GERÇEK-ÇALIŞAN satıcı ARAMA linkleri (ürün linki admin tarafından
// güncellenir). İdempotent: var olan SKU/ürün atlanır.
//
// Çalıştırma: npx tsx prisma/seed-garden-products.ts
// ==========================================================
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// sku, name, slug, categorySlug, price, unit, stock
const PRODUCTS: [string, string, string, string, number, string, number][] = [
  // canlı bitkiler
  ["BM-BAHCE-001", "Lavanta Fidesi (Saksıda)", "lavanta-fidesi", "bitki", 120, "ADET", 24],
  ["BM-BAHCE-002", "Biberiye Fidesi", "biberiye-fidesi", "bitki", 90, "ADET", 18],
  ["BM-BAHCE-003", "Zeytin Fidanı (Genç)", "zeytin-fidani", "bitki", 450, "ADET", 6],
  ["BM-BAHCE-004", "Sardunya (Renkli)", "sardunya", "bitki", 75, "ADET", 30],
  ["BM-BAHCE-005", "Sukulent Seti (6'lı)", "sukulent-seti", "bitki", 160, "SET", 20],
  // tohum
  ["BM-BAHCE-006", "Domates Tohumu (Yerli)", "domates-tohumu", "tohum", 25, "PAKET", 60],
  ["BM-BAHCE-007", "Biber Tohumu Karışımı", "biber-tohumu", "tohum", 25, "PAKET", 50],
  ["BM-BAHCE-008", "Çiçek Tohumu Karışımı", "cicek-tohumu", "tohum", 45, "PAKET", 40],
  ["BM-BAHCE-009", "Roka Tohumu", "roka-tohumu", "tohum", 20, "PAKET", 55],
  // sulama
  ["BM-BAHCE-010", "Damlama Sulama Kiti (20m)", "damlama-sulama-kiti", "sulama", 350, "SET", 15],
  ["BM-BAHCE-011", "Otomatik Sulama Zamanlayıcısı", "otomatik-sulama-zamanlayicisi", "sulama", 480, "ADET", 12],
  ["BM-BAHCE-012", "Mikro Damlatıcı (50'li)", "mikro-damlatıcı-50li", "sulama", 190, "SET", 25],
  ["BM-BAHCE-013", "Ayarlı Fıskiye Başlığı", "ayarli-fiskiye", "sulama", 260, "ADET", 20],
  // hortum
  ["BM-BAHCE-014", "Bahçe Hortumu 15m", "bahce-hortumu-15m", "hortum", 380, "METRE", 14],
  ["BM-BAHCE-015", "Bahçe Hortumu 25m", "bahce-hortumu-25m", "hortum", 550, "METRE", 10],
  ["BM-BAHCE-016", "Hortum Bağlantı Seti", "hortum-baglanti-seti", "hortum", 140, "SET", 30],
  // saksı
  ["BM-BAHCE-017", "Seramik Saksı 20cm", "seramik-saksi-20cm", "saksi", 180, "ADET", 22],
  ["BM-BAHCE-018", "Seramik Saksı 30cm", "seramik-saksi-30cm", "saksi", 260, "ADET", 16],
  ["BM-BAHCE-019", "Plastik Saksı Seti (5'li)", "plastik-saksi-seti", "saksi", 220, "SET", 28],
  ["BM-BAHCE-020", "Kendinden Sulamalı Saksı", "kendinden-sulamali-saksi", "saksi", 320, "ADET", 12],
  // toprak & gübre
  ["BM-BAHCE-021", "Bahçe Toprağı 50L", "bahce-topragi-50l", "toprak-gubre", 220, "TORBA", 40],
  ["BM-BAHCE-022", "Saksı Torfu 40L", "saksi-torfu-40l", "toprak-gubre", 190, "TORBA", 35],
  ["BM-BAHCE-023", "Organik Gübre 5kg", "organik-gubre-5kg", "toprak-gubre", 210, "KG", 30],
  ["BM-BAHCE-024", "Kompost 20L", "kompost-20l", "toprak-gubre", 160, "TORBA", 25],
  // alet
  ["BM-BAHCE-025", "Bahçe El Aletleri Seti (5 parça)", "bahce-el-aletleri-seti", "alet", 390, "SET", 18],
  ["BM-BAHCE-026", "Budama Makası", "budama-makasi", "alet", 180, "ADET", 24],
  ["BM-BAHCE-027", "Kürek (Kısa Saplı)", "kurek-kisa-sapli", "alet", 240, "ADET", 14],
  ["BM-BAHCE-028", "El Tırmığı", "el-tirmigi", "alet", 150, "ADET", 20],
  // çim (mevcut kategori)
  ["BM-BAHCE-029", "Çim Taşı 40x40cm (Izgara)", "cim-tasi-40x40", "cim", 85, "METREKARE", 60],
  ["BM-BAHCE-030", "Ahşap Deck Karo (10'lu)", "ahsap-deck-karo", "cim", 750, "SET", 12],
  // aydınlatma (mevcut dekorasyon kategorisi)
  ["BM-BAHCE-031", "Solar Peyzaj Spotu", "solar-peyzaj-spotu", "dekorasyon", 300, "ADET", 26],
  ["BM-BAHCE-032", "Bahçe Işık Zinciri 5m", "bahce-isik-zinciri", "dekorasyon", 350, "METRE", 18],
];

// name, vendor, category, estimatedPrice, commissionRate(%)
const AFFILIATES: [string, string, string, number, number][] = [
  ["Lavanta Fidesi (Partner)", "Trendyol", "bitki", 99, 6],
  ["Sardunya Saksı (Partner)", "Hepsiburada", "bitki", 110, 5],
  ["Zeytin Fidanı Büyük Boy", "Amazon.com.tr", "bitki", 520, 4],
  ["Domates Tohumu Seti", "Trendyol", "tohum", 60, 7],
  ["Çim Tohumu 1kg", "Hepsiburada", "tohum", 180, 6],
  ["Damlama Sulama Kiti Pro", "Amazon.com.tr", "sulama", 400, 5],
  ["Akıllı Sulama Zamanlayıcı", "Trendyol", "sulama", 520, 6],
  ["Bahçe Hortumu 30m (Premium)", "Hepsiburada", "hortum", 420, 5],
  ["Hortum Makarası", "Trendyol", "hortum", 650, 6],
  ["Seramik Saksı Seti (3'lü)", "Amazon.com.tr", "saksi", 700, 4],
  ["Kendinden Sulamalı Saksı Pro", "Hepsiburada", "saksi", 350, 6],
  ["Organik Gübre 10kg", "Trendyol", "gubre", 290, 7],
  ["Solucan Gübresi 5kg", "Amazon.com.tr", "gubre", 340, 5],
  ["Bahçe Alet Çantası (12 parça)", "Hepsiburada", "alet", 850, 4],
  ["Akülü Budama Makası", "Trendyol", "alet", 1200, 5],
  ["Ahşap Deck Karo (12'li)", "Amazon.com.tr", "mobilya", 950, 6],
  ["Balkon Oturma Seti", "Trendyol", "mobilya", 3800, 4],
  ["Solar Peyzaj Spotu Pro", "Hepsiburada", "aydinlatma", 320, 7],
  ["Ahşap Karo Seti", "Trendyol", "dekor", 750, 6],
  ["Çim Taşı Izgara (40'lı)", "Amazon.com.tr", "cim", 480, 5],
];

function vendorSearchUrl(vendor: string, name: string): string {
  if (vendor === "Trendyol") return `https://www.trendyol.com/sr?q=${encodeURIComponent(name)}`;
  if (vendor === "Hepsiburada") return `https://www.hepsiburada.com/ara?q=${encodeURIComponent(name)}`;
  return `https://www.amazon.com.tr/s?k=${encodeURIComponent(name)}`;
}

async function main() {
  let addedProducts = 0;
  for (const [sku, name, slug, categorySlug, price, unit, stock] of PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { OR: [{ sku }, { slug }] } });
    if (existing) continue;
    const cat = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!cat) {
      console.log("kategori eksik:", categorySlug);
      continue;
    }
    const product = await prisma.product.create({
      data: { sku, name, slug, categoryId: cat.id, price, unit, isActive: true, taxRate: 20 },
    });
    await prisma.inventory.create({
      data: { productId: product.id, quantity: stock, lowStockThreshold: 5, stockStatus: stock > 5 ? "IN_STOCK" : "LOW_STOCK" },
    });
    addedProducts++;
  }

  let addedAffiliates = 0;
  for (const [name, vendor, category, price, rate] of AFFILIATES) {
    const existing = await prisma.affiliateProduct.findFirst({ where: { name, vendor } });
    if (existing) continue;
    await prisma.affiliateProduct.create({
      data: { name, vendor, category, estimatedPrice: price, commissionRate: rate, affiliateUrl: vendorSearchUrl(vendor, name), isActive: true },
    });
    addedAffiliates++;
  }

  console.log(`eklenen iç ürün: ${addedProducts}, eklenen affiliate: ${addedAffiliates}`);
  console.log(`toplam: ürün=${await prisma.product.count()} (aktif=${await prisma.product.count({ where: { isActive: true } })}), affiliate=${await prisma.affiliateProduct.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
