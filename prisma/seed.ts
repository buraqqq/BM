/**
 * B&M Vourla — Ürün Migrasyonu (Bölüm 6, madde 6)
 *
 * Kaynak: prisma/legacy/products.legacy.js (eski repo'dan birebir kopya,
 * BAM_CATEGORIES sabiti — 7 kategori, 257 ürün).
 *
 * Bu script:
 *  1) 7 kategoriyi Category tablosuna yazar (legacy id -> slug).
 *  2) 257 ürünün TAMAMINI Product tablosuna yazar (hiçbiri sessizce atlanmaz).
 *  3) Her ürün için: slug/SKU üretir, "TL/kg" gibi serbest metin birimi
 *     enum karşılığına çevirir, fiyatı Decimal'e çevirir.
 *  4) Duplicate (aynı kategori + aynı isim) veya hatalı (fiyat/isim
 *     eksik) kayıtları tespit eder; böyle bir kayıt bulunursa SİLMEZ,
 *     isActive=false yapar ve nedenini AuditLog'a + migration-report.json'a yazar.
 *  5) Her ürün için başlangıç Inventory kaydı ve PriceHistory (migration)
 *     kaydı oluşturur.
 *  6) Genel site ayarlarını (Bize Ulaşın vb.) Settings tablosuna yazar.
 *
 * Çalıştırma: npm run seed
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { LEGACY_UNIT_TO_ENUM, type ProductUnit } from "../src/lib/enums";
import { slugify, uniqueSlug } from "../src/lib/slug";

const prisma = new PrismaClient();

interface LegacyProduct {
  name: string;
  price: string;
  unit: string;
}
interface LegacyCategory {
  id: string;
  icon: string;
  title: string;
  shortDesc: string;
  color: string;
  products: LegacyProduct[];
}

function loadLegacyCategories(): LegacyCategory[] {
  const filePath = path.join(__dirname, "legacy", "products.legacy.js");
  const raw = fs.readFileSync(filePath, "utf8");
  const transformed = raw.replace("const BAM_CATEGORIES =", "module.exports =");
  const tmpPath = path.join(__dirname, "legacy", ".products.legacy.eval.js");
  fs.writeFileSync(tmpPath, transformed);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require(tmpPath) as LegacyCategory[];
  fs.unlinkSync(tmpPath);
  return data;
}

const usedSlugs = new Set<string>();
async function nextSlug(base: string) {
  const s = await uniqueSlug(base, async (candidate) => {
    if (usedSlugs.has(candidate)) return true;
    const found = await prisma.product.findUnique({ where: { slug: candidate } });
    return !!found;
  });
  usedSlugs.add(s);
  return s;
}

interface MigrationIssue {
  legacySourceId: string;
  category: string;
  name: string;
  reason: string;
}

async function main() {
  console.log("== B&M Vourla ürün migrasyonu başlıyor ==");
  const legacyCategories = loadLegacyCategories();
  const totalLegacyProducts = legacyCategories.reduce((sum, c) => sum + c.products.length, 0);
  console.log(`Kaynak dosyada ${legacyCategories.length} kategori, ${totalLegacyProducts} ürün bulundu.`);

  const issues: MigrationIssue[] = [];
  const categorySlugToId = new Map<string, string>();

  // 1) Kategoriler
  for (let i = 0; i < legacyCategories.length; i++) {
    const c = legacyCategories[i];
    const category = await prisma.category.upsert({
      where: { slug: c.id },
      update: {
        title: c.title,
        shortDescription: c.shortDesc,
        icon: c.icon,
        color: c.color,
        sortOrder: i,
      },
      create: {
        slug: c.id,
        title: c.title,
        shortDescription: c.shortDesc,
        icon: c.icon,
        color: c.color,
        sortOrder: i,
      },
    });
    categorySlugToId.set(c.id, category.id);
    console.log(`  ✓ Kategori: ${c.title} (${c.products.length} ürün)`);
  }

  // 2) Ürünler
  let migratedCount = 0;
  let flaggedCount = 0;
  const seenInCategory = new Map<string, Set<string>>(); // category.id -> Set(normalizedName)

  for (const c of legacyCategories) {
    const categoryId = categorySlugToId.get(c.id)!;
    if (!seenInCategory.has(c.id)) seenInCategory.set(c.id, new Set());
    const seenSet = seenInCategory.get(c.id)!;

    for (let idx = 0; idx < c.products.length; idx++) {
      const p = c.products[idx];
      const legacySourceId = `${c.id}-${idx}`;
      const normalizedName = p.name?.trim().toLowerCase() ?? "";

      // --- Doğrulama ---
      let problem: string | null = null;
      if (!p.name || !normalizedName) problem = "Ürün adı boş/eksik";
      else if (!/^\d+(\.\d+)?$/.test(p.price ?? "")) problem = `Geçersiz fiyat formatı: "${p.price}"`;
      else if (seenSet.has(normalizedName)) problem = "Aynı kategori içinde tekrarlayan ürün adı (duplicate)";

      const unitEnum: ProductUnit | undefined = LEGACY_UNIT_TO_ENUM[p.unit];
      if (!problem && !unitEnum) problem = `Tanınmayan birim: "${p.unit}"`;

      if (problem) {
        issues.push({ legacySourceId, category: c.title, name: p.name ?? "(isimsiz)", reason: problem });
      }
      seenSet.add(normalizedName);

      const price = problem ? 0 : Number(p.price);
      const unit: ProductUnit = unitEnum ?? "ADET";
      const name = (p.name ?? `Adlandırılmamış ürün ${legacySourceId}`).trim();
      const sku = `BM-${c.id.toUpperCase()}-${String(idx + 1).padStart(3, "0")}`;
      const slug = await nextSlug(name);

      const isActive = !problem; // sorunlu kayıtlar pasif başlar, SİLİNMEZ

      const product = await prisma.product.create({
        data: {
          sku,
          name,
          slug,
          categoryId,
          price,
          unit,
          isActive,
          legacySourceId,
          legacyCategoryLabel: c.title,
        },
      });

      await prisma.priceHistory.create({
        data: {
          productId: product.id,
          field: "price",
          oldValue: null,
          newValue: price,
          reason: problem ? `migration (flagged: ${problem})` : "migration",
        },
      });

      // Bkz. migration.md — gerçek stok verisi legacy sistemde hiç
      // tutulmuyordu (FAZ 0 audit bulgusu). Başlangıç değeri olarak
      // güvenli bir varsayılan (50) atanır; gerçek sayım admin panelinden
      // girilmelidir. Bu, InventoryMovement kaydında açıkça belirtilir.
      const startQty = isActive ? 50 : 0;
      const inventory = await prisma.inventory.create({
        data: {
          productId: product.id,
          quantity: startQty,
          stockStatus: isActive ? "IN_STOCK" : "OUT_OF_STOCK",
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type: "MIGRATION",
          quantityChange: startQty,
          resultingQuantity: startQty,
          reason:
            "Migrasyon: legacy products.js hiç stok verisi tutmuyordu. Varsayılan başlangıç miktarı atandı, gerçek sayım gerekiyor.",
        },
      });

      migratedCount++;
      if (problem) flaggedCount++;
    }
  }

  console.log(`\n== Migrasyon tamamlandı ==`);
  console.log(`Toplam işlenen kayıt: ${migratedCount} / ${totalLegacyProducts}`);
  console.log(`Sorunlu (inactive işaretlenen) kayıt: ${flaggedCount}`);

  // 3) Migration audit log (özet)
  await prisma.auditLog.create({
    data: {
      adminUserId: null,
      action: "PRODUCT_CREATE",
      entity: "Migration",
      entityId: "products.legacy.js",
      metadataJson: JSON.stringify({
        totalLegacyProducts,
        migratedCount,
        flaggedCount,
        issues,
      }),
    },
  });

  // 4) Migration raporu dosyaya da yazılır (docs/migration.md içinde referans verilir)
  fs.writeFileSync(
    path.join(__dirname, "legacy", "migration-report.json"),
    JSON.stringify({ totalLegacyProducts, migratedCount, flaggedCount, issues }, null, 2)
  );
  console.log(`Detaylı rapor: prisma/legacy/migration-report.json`);
  if (issues.length > 0) {
    console.log("\nSorunlu kayıtlar:");
    issues.forEach((i) => console.log(`  - [${i.category}] ${i.name} (${i.legacySourceId}): ${i.reason}`));
  } else {
    console.log("Hiçbir duplicate veya hatalı kayıt bulunmadı.");
  }

  // 5) Genel site ayarları (Bize Ulaşın vb.) — index.html'den birebir taşındı
  const settings: Record<string, string> = {
    site_name: "B&M Vourla – Bahçe & Mangal",
    site_tagline: "Bahçe & Mangal",
    contact_address_line: "Altıntaş Mah. Besim Uyal Cad. No:121/A Urla / İzmir",
    contact_maps_url:
      "https://www.google.com/maps/dir/?api=1&destination=Alt%C4%B1nta%C5%9F+Mahallesi+Besim+Uyal+Caddesi+No%3A121%2FA+Urla%2F%C4%B0zmir",
    contact_whatsapp: "905060557530",
    contact_phone: "+905060557530",
    contact_hours: "Her Gün 08:00 - 20:00",
    contact_instagram_handle: "@bm.vourla",
    contact_instagram_url: "https://www.instagram.com/bm.vourla?igsh=d3FxZWYyb2MwMmEx",
    contact_email: "bm.vourla@gmail.com",
    footer_copyright: "© 2026 B&M Vourla – Bahçe & Mangal | Altıntaş Mah. Besim Uyal Cad. No:121/A Urla/İzmir",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  console.log(`\n${Object.keys(settings).length} site ayarı (Settings) yazıldı.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
