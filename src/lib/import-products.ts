import { PRODUCT_UNITS, type ProductUnit } from "@/lib/enums";
import { isSimilarName } from "@/lib/duplicate-check";

// ==========================================================
// Bölüm 23/24/26 — CSV İçe Aktarma: sütun eşleştirme + doğrulama.
//
// Bu modül HEM önizleme (dry-run) HEM de gerçek commit tarafından
// kullanılan TEK doğrulama fonksiyonunu barındırır — önizlemede gösterilen
// hata/uyarılar ile commit sırasında gerçekten uygulanan kurallar ASLA
// birbirinden sapmaz (aynı fonksiyon, aynı girdiyle iki kez çağrılır).
//
// Satır numaraları kullanıcıya "Satır N" olarak gösterildiğinde, N = CSV
// dosyasındaki gerçek satır numarasıdır (1. satır = başlık, ilk veri
// satırı = 2). Örnek: "Satır 18: SKU eksik".
// ==========================================================

export const IMPORT_TARGET_FIELDS = [
  "name",
  "sku",
  "barcode",
  "category",
  "brand",
  "price",
  "compareAtPrice",
  "salePrice",
  "costPrice",
  "taxRate",
  "unit",
  "stock",
  "minimumStock",
  "isActive",
  "isFeatured",
  "shortDescription",
  "description",
  "seoTitle",
  "seoDescription",
] as const;
export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportTargetField, string> = {
  name: "Ürün Adı",
  sku: "SKU",
  barcode: "Barkod",
  category: "Kategori (tam ad)",
  brand: "Marka (tam ad)",
  price: "Fiyat",
  compareAtPrice: "Eski Fiyat (Karşılaştırma)",
  salePrice: "İndirimli Fiyat",
  costPrice: "Maliyet Fiyatı",
  taxRate: "KDV (%)",
  unit: "Birim",
  stock: "Stok",
  minimumStock: "Min. Stok",
  isActive: "Aktif mi",
  isFeatured: "Öne Çıkan mı",
  shortDescription: "Kısa Açıklama",
  description: "Açıklama",
  seoTitle: "SEO Başlık",
  seoDescription: "SEO Açıklama",
};

export const REQUIRED_IMPORT_FIELDS: ImportTargetField[] = ["name", "sku", "category", "price"];

// Sütun adı otomatik eşleştirme için sık kullanılan Türkçe/İngilizce başlık
// eşanlamlıları — yalnızca kullanıcı deneyimini kolaylaştırır (admin
// önizlemeden önce eşleştirmeyi elle düzeltebilir), doğrulamayı etkilemez.
const HEADER_SYNONYMS: Record<ImportTargetField, string[]> = {
  name: ["ürün adı", "urun adi", "ad", "isim", "name", "product name", "title"],
  sku: ["sku", "stok kodu", "ürün kodu", "urun kodu", "kod"],
  barcode: ["barkod", "barcode", "ean"],
  category: ["kategori", "category"],
  brand: ["marka", "brand"],
  price: ["fiyat", "price", "satış fiyatı", "satis fiyati", "liste fiyatı"],
  compareAtPrice: ["eski fiyat", "karşılaştırma fiyatı", "compare at price", "üstü çizili fiyat"],
  salePrice: ["indirimli fiyat", "kampanya fiyatı", "sale price"],
  costPrice: ["maliyet", "maliyet fiyatı", "cost price", "alış fiyatı"],
  taxRate: ["kdv", "kdv oranı", "tax rate", "vat"],
  unit: ["birim", "unit"],
  stock: ["stok", "stock", "adet", "miktar", "quantity"],
  minimumStock: ["min stok", "minimum stok", "min. stok", "minimum stock", "kritik stok"],
  isActive: ["aktif", "aktif mi", "durum", "active", "status"],
  isFeatured: ["öne çıkan", "one cikan", "öne çıkan mı", "featured"],
  shortDescription: ["kısa açıklama", "kisa aciklama", "short description"],
  description: ["açıklama", "aciklama", "description"],
  seoTitle: ["seo başlık", "seo baslik", "seo title"],
  seoDescription: ["seo açıklama", "seo aciklama", "seo description"],
};

// JS'in yerelleştirme-duyarsız .toLowerCase()'i Türkçe büyük "İ"yi
// (U+0130) "i" + birleşen nokta işaretine (U+0307) çevirir, düz "i"ye
// değil — bu yüzden "İndirimli Fiyat" gibi başlıklar sıradan
// .toLowerCase() ile "indirimli fiyat"a eşit ÇIKMAZ. Eşleştirme öncesi bu
// TR harfini elle normalize ediyoruz.
function normalizeHeader(s: string): string {
  return s.trim().replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

// Dışa aktarılan bir dosyanın HİÇBİR elle eşleştirme gerekmeden geri içe
// aktarılabilmesi için (bkz. /api/admin/products/export açıklaması), her
// alanın kendi CSV başlığı (IMPORT_FIELD_LABELS) da otomatik olarak kendi
// eşanlamlı listesine ekleniyor — iki liste elle senkronize tutulmaya
// çalışılmıyor, tek kaynaktan (IMPORT_FIELD_LABELS) türetiliyor.
const HEADER_SYNONYMS_WITH_LABELS: Record<ImportTargetField, string[]> = Object.fromEntries(
  IMPORT_TARGET_FIELDS.map((field) => [
    field,
    [...new Set([normalizeHeader(IMPORT_FIELD_LABELS[field]), ...HEADER_SYNONYMS[field].map(normalizeHeader)])],
  ])
) as Record<ImportTargetField, string[]>;

/** CSV başlıklarına bakarak canonical alanları tahmin eder (csvHeader -> field). Kullanıcı UI'da düzeltebilir. */
export function guessColumnMapping(headers: string[]): Record<string, ImportTargetField> {
  const mapping: Record<string, ImportTargetField> = {};
  const used = new Set<ImportTargetField>();
  for (const header of headers) {
    const norm = normalizeHeader(header);
    for (const field of IMPORT_TARGET_FIELDS) {
      if (used.has(field)) continue;
      if (HEADER_SYNONYMS_WITH_LABELS[field].includes(norm)) {
        mapping[header] = field;
        used.add(field);
        break;
      }
    }
  }
  return mapping;
}

function parseNumber(input: string): number | null {
  let s = input.trim();
  if (s === "") return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  // TR biçimi: "1.234,56" (nokta=binlik, virgül=ondalık). Yalnızca virgül
  // varsa onu ondalık ayraç kabul et ("19,90" -> 19.90). Yalnızca nokta
  // varsa standart biçim olarak bırak ("199.99").
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma && !hasDot) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseBoolean(input: string, defaultValue: boolean): boolean {
  const s = input.trim().toLowerCase();
  if (s === "") return defaultValue;
  if (["evet", "true", "1", "aktif", "yes"].includes(s)) return true;
  if (["hayır", "hayir", "false", "0", "pasif", "no"].includes(s)) return false;
  return defaultValue;
}

export interface ImportCategoryRef {
  id: string;
  title: string;
}
export interface ImportBrandRef {
  id: string;
  name: string;
}
export interface ImportExistingProductRef {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
}

export interface ImportContext {
  categories: ImportCategoryRef[];
  brands: ImportBrandRef[];
  existingProducts: ImportExistingProductRef[];
}

export interface ParsedImportProduct {
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string;
  brandId: string | null;
  price: number;
  compareAtPrice: number | null;
  salePrice: number | null;
  costPrice: number | null;
  taxRate: number;
  unit: ProductUnit;
  stock: number;
  minimumStock: number;
  isActive: boolean;
  isFeatured: boolean;
  shortDescription: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface ParsedImportRow {
  rowNumber: number; // CSV'deki gerçek satır no (başlık=1, ilk veri satırı=2)
  raw: Record<string, string>;
  errors: string[];
  warnings: string[];
  action: "CREATE" | "UPDATE" | "SKIP";
  existingProductId?: string;
  product?: ParsedImportProduct; // yalnızca errors boşsa dolu
}

export interface ImportValidationSummary {
  totalRows: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  warningCount: number;
}

export function summarizeImportRows(rows: ParsedImportRow[]): ImportValidationSummary {
  return {
    totalRows: rows.length,
    createCount: rows.filter((r) => r.action === "CREATE").length,
    updateCount: rows.filter((r) => r.action === "UPDATE").length,
    errorCount: rows.filter((r) => r.errors.length > 0).length,
    warningCount: rows.filter((r) => r.warnings.length > 0).length,
  };
}

export function validateImportRows(
  rows: Record<string, string>[],
  columnMapping: Record<string, string>,
  ctx: ImportContext
): ParsedImportRow[] {
  const mappingEntries = Object.entries(columnMapping).filter(([, field]) => !!field);
  const categoryByTitle = new Map(ctx.categories.map((c) => [c.title.trim().toLowerCase(), c]));
  const brandByName = new Map(ctx.brands.map((b) => [b.name.trim().toLowerCase(), b]));
  const existingBySku = new Map(ctx.existingProducts.map((p) => [p.sku.trim().toLowerCase(), p]));
  const existingByBarcode = new Map(
    ctx.existingProducts.filter((p) => p.barcode).map((p) => [p.barcode!.trim().toLowerCase(), p])
  );

  const mappedRows = rows.map((raw, idx) => {
    const rowNumber = idx + 2;
    const mapped: Record<string, string> = {};
    for (const [csvHeader, field] of mappingEntries) mapped[field] = (raw[csvHeader] ?? "").trim();
    return { rowNumber, raw, mapped };
  });

  // Dosya içi SKU/barkod çakışmalarını önceden tespit et (satır bazlı hata
  // mesajlarında "hangi satırlarla çakıştığı" bilgisini verebilmek için).
  const skuRowMap = new Map<string, number[]>();
  const barcodeRowMap = new Map<string, number[]>();
  for (const { rowNumber, mapped } of mappedRows) {
    const skuKey = (mapped.sku ?? "").toLowerCase();
    if (skuKey) skuRowMap.set(skuKey, [...(skuRowMap.get(skuKey) ?? []), rowNumber]);
    const barcodeKey = (mapped.barcode ?? "").toLowerCase();
    if (barcodeKey) barcodeRowMap.set(barcodeKey, [...(barcodeRowMap.get(barcodeKey) ?? []), rowNumber]);
  }

  return mappedRows.map(({ rowNumber, raw, mapped }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = mapped.name ?? "";
    if (!name) errors.push("Ürün adı eksik");

    const sku = mapped.sku ?? "";
    if (!sku) errors.push("SKU eksik");
    const skuKey = sku.toLowerCase();
    if (skuKey && (skuRowMap.get(skuKey)?.length ?? 0) > 1) {
      errors.push(`Bu SKU dosya içinde birden fazla satırda kullanılmış (satırlar: ${skuRowMap.get(skuKey)!.join(", ")})`);
    }

    const barcode = mapped.barcode || null;
    const barcodeKey = barcode?.toLowerCase();
    if (barcodeKey && (barcodeRowMap.get(barcodeKey)?.length ?? 0) > 1) {
      errors.push(`Bu barkod dosya içinde birden fazla satırda kullanılmış (satırlar: ${barcodeRowMap.get(barcodeKey)!.join(", ")})`);
    }

    const existingBySkuMatch = skuKey ? existingBySku.get(skuKey) : undefined;
    const existingByBarcodeMatch = barcodeKey ? existingByBarcode.get(barcodeKey) : undefined;
    if (existingByBarcodeMatch && existingBySkuMatch && existingByBarcodeMatch.id !== existingBySkuMatch.id) {
      errors.push(`Bu barkod başka bir ürüne ait: ${existingByBarcodeMatch.name} (${existingByBarcodeMatch.sku})`);
    } else if (existingByBarcodeMatch && !existingBySkuMatch) {
      errors.push(`Bu barkod başka bir ürüne ait: ${existingByBarcodeMatch.name} (${existingByBarcodeMatch.sku})`);
    }

    let categoryId: string | undefined;
    const categoryTitle = mapped.category ?? "";
    if (!categoryTitle) {
      errors.push("Kategori eksik");
    } else {
      const cat = categoryByTitle.get(categoryTitle.trim().toLowerCase());
      if (!cat) errors.push(`Kategori bulunamadı: "${categoryTitle}" (önce admin panelinden bu kategoriyi oluşturun — içe aktarma otomatik kategori oluşturmaz)`);
      else categoryId = cat.id;
    }

    let brandId: string | null = null;
    const brandName = mapped.brand ?? "";
    if (brandName) {
      const brand = brandByName.get(brandName.trim().toLowerCase());
      if (!brand) errors.push(`Marka bulunamadı: "${brandName}" (önce admin panelinden bu markayı oluşturun)`);
      else brandId = brand.id;
    }

    const priceRaw = mapped.price ?? "";
    let price: number | null = null;
    if (!priceRaw) errors.push("Fiyat eksik");
    else {
      price = parseNumber(priceRaw);
      if (price === null || price <= 0) errors.push(`Geçersiz fiyat: "${priceRaw}"`);
    }

    function optionalNumber(field: ImportTargetField, label: string): number | null {
      const rawVal = mapped[field] ?? "";
      if (!rawVal) return null;
      const n = parseNumber(rawVal);
      if (n === null || n < 0) {
        errors.push(`Geçersiz ${label}: "${rawVal}"`);
        return null;
      }
      return n;
    }

    function optionalInt(field: ImportTargetField, label: string): number | null {
      const rawVal = mapped[field] ?? "";
      if (!rawVal) return null;
      const n = parseNumber(rawVal);
      if (n === null || !Number.isInteger(n) || n < 0) {
        errors.push(`Geçersiz ${label}: "${rawVal}" (tam sayı, negatif olmayan bir değer olmalı)`);
        return null;
      }
      return n;
    }

    const compareAtPrice = optionalNumber("compareAtPrice", "eski fiyat");
    const salePrice = optionalNumber("salePrice", "indirimli fiyat");
    const costPrice = optionalNumber("costPrice", "maliyet fiyatı");
    const taxRateParsed = optionalNumber("taxRate", "KDV oranı");
    const taxRate = taxRateParsed ?? 20;

    let unit: ProductUnit = "ADET";
    const unitRaw = (mapped.unit ?? "").trim().toUpperCase();
    if (unitRaw) {
      if ((PRODUCT_UNITS as readonly string[]).includes(unitRaw)) unit = unitRaw as ProductUnit;
      else errors.push(`Geçersiz birim: "${mapped.unit}" (izin verilenler: ${PRODUCT_UNITS.join(", ")})`);
    }

    const stock = optionalInt("stock", "stok") ?? 0;
    const minimumStock = optionalInt("minimumStock", "minimum stok") ?? 5;
    const isActive = parseBoolean(mapped.isActive ?? "", true);
    const isFeatured = parseBoolean(mapped.isFeatured ?? "", false);

    const action: ParsedImportRow["action"] = errors.length > 0 ? "SKIP" : existingBySkuMatch ? "UPDATE" : "CREATE";

    // Bölüm 27 — deterministik (AI'sız) benzer isim uyarısı: hard block
    // değil, yalnızca admin'e bilgi amaçlı gösterilir.
    // PERFORMANS NOTU: bu O(satır × mevcut ürün) bir tarama — bugünkü 257
    // ürünlük katalogda sorun yaratmaz, ancak katalog birkaç bin ürüne
    // ulaştığında (Bölüm 45'in 5.000/10.000/50.000 hedefi) burası indeksli
    // bir ön-filtreye (ör. ilk karaktere göre gruplama) ihtiyaç duyacaktır.
    if (name) {
      const dup = ctx.existingProducts.find((p) => p.id !== existingBySkuMatch?.id && isSimilarName(name, p.name));
      if (dup) warnings.push(`Çok benzer isimli ürün zaten mevcut: "${dup.name}" (${dup.sku})`);
    }

    const result: ParsedImportRow = {
      rowNumber,
      raw,
      errors,
      warnings,
      action,
      existingProductId: existingBySkuMatch?.id,
    };

    if (errors.length === 0 && categoryId && price !== null) {
      result.product = {
        name,
        sku,
        barcode,
        categoryId,
        brandId,
        price,
        compareAtPrice,
        salePrice,
        costPrice,
        taxRate,
        unit,
        stock,
        minimumStock,
        isActive,
        isFeatured,
        shortDescription: mapped.shortDescription || null,
        description: mapped.description || null,
        seoTitle: mapped.seoTitle || null,
        seoDescription: mapped.seoDescription || null,
      };
    }

    return result;
  });
}
