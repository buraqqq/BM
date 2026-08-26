import { describe, it, expect } from "vitest";
import {
  guessColumnMapping,
  validateImportRows,
  summarizeImportRows,
  IMPORT_FIELD_LABELS,
  IMPORT_TARGET_FIELDS,
  type ImportContext,
} from "@/lib/import-products";

// Bölüm 23/24/26 — CSV İçe Aktarma doğrulaması. Önizleme ve commit AYNI
// validateImportRows() fonksiyonunu kullanır — burada test edilen davranış
// ikisi için de geçerlidir.

describe("guessColumnMapping", () => {
  it("Türkçe başlıkları doğru alanlara eşler", () => {
    const mapping = guessColumnMapping(["Ürün Adı", "SKU", "Kategori", "Fiyat", "Stok"]);
    expect(mapping["Ürün Adı"]).toBe("name");
    expect(mapping["SKU"]).toBe("sku");
    expect(mapping["Kategori"]).toBe("category");
    expect(mapping["Fiyat"]).toBe("price");
    expect(mapping["Stok"]).toBe("stock");
  });

  it("dışa aktarılan TÜM başlıklar (IMPORT_FIELD_LABELS) elle eşleştirme gerekmeden geri eşlenir", () => {
    // Bölüm 26 — export -> re-import round-trip garantisi. Her hedef alanın
    // kendi export başlığı, guessColumnMapping tarafından tanınmalı.
    const headers = IMPORT_TARGET_FIELDS.map((f) => IMPORT_FIELD_LABELS[f]);
    const mapping = guessColumnMapping(headers);
    for (const field of IMPORT_TARGET_FIELDS) {
      expect(mapping[IMPORT_FIELD_LABELS[field]]).toBe(field);
    }
  });

  it("Türkçe büyük İ harfi içeren başlıkları da doğru eşler (yerelleştirme-duyarsız toLowerCase tuzağı)", () => {
    const mapping = guessColumnMapping(["İndirimli Fiyat", "Öne Çıkan mı"]);
    expect(mapping["İndirimli Fiyat"]).toBe("salePrice");
    expect(mapping["Öne Çıkan mı"]).toBe("isFeatured");
  });

  it("tanınmayan bir başlığı hiçbir alana eşlemez", () => {
    const mapping = guessColumnMapping(["Tamamen Alakasız Sütun"]);
    expect(mapping["Tamamen Alakasız Sütun"]).toBeUndefined();
  });

  it("aynı alanı iki farklı başlığa eşlemez (ilk eşleşen kazanır)", () => {
    const mapping = guessColumnMapping(["Fiyat", "Satış Fiyatı"]);
    expect(mapping["Fiyat"]).toBe("price");
    expect(mapping["Satış Fiyatı"]).toBeUndefined();
  });
});

function baseContext(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    categories: [{ id: "cat-sulama", title: "Sulama" }],
    brands: [{ id: "brand-x", name: "MarkaX" }],
    existingProducts: [{ id: "existing-1", sku: "BM-HORT-020", barcode: "8690000000011", name: "Bahçe Hortumu 20m" }],
    ...overrides,
  };
}

const FULL_MAPPING: Record<string, string> = {
  "Ürün Adı": "name",
  SKU: "sku",
  Kategori: "category",
  Marka: "brand",
  Fiyat: "price",
  Stok: "stock",
  Birim: "unit",
};

describe("validateImportRows", () => {
  it("geçerli bir satırı CREATE olarak işaretler ve product alanını doldurur", () => {
    const rows = validateImportRows(
      [{ "Ürün Adı": "Yeni Fıskiye", SKU: "BM-FISK-001", Kategori: "Sulama", Fiyat: "199,90", Stok: "10" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.errors).toEqual([]);
    expect(row.action).toBe("CREATE");
    expect(row.product?.price).toBe(199.9);
    expect(row.product?.categoryId).toBe("cat-sulama");
    expect(row.product?.stock).toBe(10);
  });

  it("mevcut SKU'ya sahip satırı UPDATE olarak işaretler", () => {
    const rows = validateImportRows(
      [{ "Ürün Adı": "Bahçe Hortumu 20m", SKU: "BM-HORT-020", Kategori: "Sulama", Fiyat: "500" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].action).toBe("UPDATE");
    expect(rows[0].existingProductId).toBe("existing-1");
  });

  it("eksik zorunlu alanlar için satır bazlı hata üretir ve satırı SKIP yapar", () => {
    const rows = validateImportRows([{ "Ürün Adı": "", SKU: "", Kategori: "", Fiyat: "" }], FULL_MAPPING, baseContext());
    expect(rows[0].action).toBe("SKIP");
    expect(rows[0].errors).toEqual(
      expect.arrayContaining(["Ürün adı eksik", "SKU eksik", "Kategori eksik", "Fiyat eksik"])
    );
  });

  it("gerçek satır numarasını doğru hesaplar (başlık=1, ilk veri satırı=2)", () => {
    const rows = validateImportRows(
      [
        { "Ürün Adı": "A", SKU: "BM-A", Kategori: "Sulama", Fiyat: "10" },
        { "Ürün Adı": "", SKU: "", Kategori: "", Fiyat: "" },
      ],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].rowNumber).toBe(2);
    expect(rows[1].rowNumber).toBe(3);
  });

  it("bulunamayan kategori için açıklayıcı hata üretir", () => {
    const rows = validateImportRows(
      [{ "Ürün Adı": "X", SKU: "BM-X", Kategori: "Olmayan Kategori", Fiyat: "10" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].errors.some((e) => e.includes("Kategori bulunamadı"))).toBe(true);
  });

  it("bulunamayan marka için açıklayıcı hata üretir (marka opsiyonel ama girilmişse geçerli olmalı)", () => {
    const rows = validateImportRows(
      [{ "Ürün Adı": "X", SKU: "BM-X", Kategori: "Sulama", Marka: "Olmayan Marka", Fiyat: "10" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].errors.some((e) => e.includes("Marka bulunamadı"))).toBe(true);
  });

  it("negatif veya sıfır fiyatı reddeder", () => {
    const rows = validateImportRows(
      [
        { "Ürün Adı": "X", SKU: "BM-X1", Kategori: "Sulama", Fiyat: "-5" },
        { "Ürün Adı": "Y", SKU: "BM-X2", Kategori: "Sulama", Fiyat: "0" },
      ],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].errors.some((e) => e.includes("Geçersiz fiyat"))).toBe(true);
    expect(rows[1].errors.some((e) => e.includes("Geçersiz fiyat"))).toBe(true);
  });

  it("TR sayı biçimini doğru ayrıştırır (1.234,56 -> 1234.56)", () => {
    const rows = validateImportRows(
      [{ "Ürün Adı": "X", SKU: "BM-X", Kategori: "Sulama", Fiyat: "1.234,56" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].product?.price).toBe(1234.56);
  });

  it("standart nokta ondalık biçimini de kabul eder (199.99)", () => {
    const rows = validateImportRows(
      [{ "Ürün Adı": "X", SKU: "BM-X", Kategori: "Sulama", Fiyat: "199.99" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].product?.price).toBe(199.99);
  });

  it("geçersiz birim için hata üretir, geçerli birimi kabul eder", () => {
    const invalid = validateImportRows(
      [{ "Ürün Adı": "X", SKU: "BM-X", Kategori: "Sulama", Fiyat: "10", Birim: "GALON" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(invalid[0].errors.some((e) => e.includes("Geçersiz birim"))).toBe(true);

    const valid = validateImportRows(
      [{ "Ürün Adı": "X", SKU: "BM-X", Kategori: "Sulama", Fiyat: "10", Birim: "METRE" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(valid[0].product?.unit).toBe("METRE");
  });

  it("dosya içinde tekrarlayan SKU'lar için ilgili tüm satırları hatalı işaretler", () => {
    const rows = validateImportRows(
      [
        { "Ürün Adı": "X", SKU: "BM-DUP", Kategori: "Sulama", Fiyat: "10" },
        { "Ürün Adı": "Y", SKU: "BM-DUP", Kategori: "Sulama", Fiyat: "20" },
      ],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].errors.some((e) => e.includes("birden fazla satırda"))).toBe(true);
    expect(rows[1].errors.some((e) => e.includes("birden fazla satırda"))).toBe(true);
  });

  it("başka bir ürüne ait barkod kullanılırsa hata üretir, boşsa hataya sebep olmaz", () => {
    const mappingWithBarcode = { ...FULL_MAPPING, Barkod: "barcode" };

    const withoutBarcode = validateImportRows(
      [{ "Ürün Adı": "X", SKU: "BM-YENI", Kategori: "Sulama", Fiyat: "10" }],
      mappingWithBarcode,
      baseContext()
    );
    expect(withoutBarcode[0].errors.length).toBe(0);

    // Barkod sütunu haritalanmışsa ve mevcut bir ürüne aitse (farklı SKU) hata beklenir.
    const withConflict = validateImportRows(
      [{ "Ürün Adı": "X", SKU: "BM-YENI", Kategori: "Sulama", Fiyat: "10", Barkod: "8690000000011" }],
      mappingWithBarcode,
      baseContext()
    );
    expect(withConflict[0].errors.some((e) => e.includes("başka bir ürüne ait"))).toBe(true);
  });

  it("çok benzer isimli mevcut bir ürün varsa uyarı üretir ama hard block yapmaz", () => {
    const rows = validateImportRows(
      [{ "Ürün Adı": "Bahce Hortumu 20m", SKU: "BM-YENI-BENZER", Kategori: "Sulama", Fiyat: "10" }],
      FULL_MAPPING,
      baseContext()
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings.some((w) => w.includes("Çok benzer isimli"))).toBe(true);
    expect(rows[0].action).toBe("CREATE");
  });

  it("TR biçimli evet/hayır değerlerini boolean'a çevirir", () => {
    const rows = validateImportRows(
      [
        {
          "Ürün Adı": "X",
          SKU: "BM-X",
          Kategori: "Sulama",
          Fiyat: "10",
          "Aktif mi": "hayır",
          "Öne Çıkan mı": "evet",
        },
      ],
      { ...FULL_MAPPING, "Aktif mi": "isActive", "Öne Çıkan mı": "isFeatured" },
      baseContext()
    );
    expect(rows[0].product?.isActive).toBe(false);
    expect(rows[0].product?.isFeatured).toBe(true);
  });
});

describe("summarizeImportRows", () => {
  it("toplam/create/update/error/warning sayılarını doğru hesaplar", () => {
    const rows = validateImportRows(
      [
        { "Ürün Adı": "Yeni", SKU: "BM-NEW", Kategori: "Sulama", Fiyat: "10" },
        { "Ürün Adı": "Bahçe Hortumu 20m", SKU: "BM-HORT-020", Kategori: "Sulama", Fiyat: "500" },
        { "Ürün Adı": "", SKU: "", Kategori: "", Fiyat: "" },
      ],
      FULL_MAPPING,
      baseContext()
    );
    const summary = summarizeImportRows(rows);
    expect(summary.totalRows).toBe(3);
    expect(summary.createCount).toBe(1);
    expect(summary.updateCount).toBe(1);
    expect(summary.errorCount).toBe(1);
  });
});
