# CSV İçe/Dışa Aktarma (FAZ 2)

## Neden CSV, neden XLSX yok (bilinçli karar)

Spesifikasyon "CSV ve mümkünse XLSX" diyordu. **Yalnızca CSV** desteklendi — bilinçli bir güvenlik kararı: XLSX ayrıştırma, ek bir bağımlılık (ve onun kendi güvenlik yüzeyini: makro/formula injection riski, zip-bomb benzeri sıkıştırma saldırıları) ekliyor; CSV metin tabanlı ve saldırı yüzeyi çok daha küçük. Katalog ölçeği (10.000-50.000 satır) için CSV performans açısından da yeterli. `/admin/import-export` ekranında bu karar kullanıcıya açıkça not edilir.

## Akış (Bölüm 23)

```
DOSYA SEÇ (client-side FileReader + parseCsv)
  ↓
SÜTUN EŞLEŞTİRME (guessColumnMapping ile otomatik öneri, admin elle düzeltebilir)
  ↓
ÖNİZLEME (POST /api/admin/import/preview, dryRun — hiçbir yazma yapmaz)
  ↓
VALIDATION + HATA RAPORU (satır bazlı, hatalı satırlar açıkça işaretli)
  ↓
ONAY
  ↓
IMPORT (POST /api/admin/import/commit — gerçek uygulama)
```

Önizleme ve commit **aynı** `validateImportRows()` fonksiyonunu (`src/lib/import-products.ts`) çağırır — önizlemede gösterilen hata/uyarı, commit'te uygulanan kuraldan asla sapmaz (iki ayrı, birbirinden kayabilecek kod yolu yok).

## Sütun eşleştirme (Bölüm 24)

`guessColumnMapping(headers)`: Türkçe/İngilizce eşanlamlı sözlüğü (`HEADER_SYNONYMS`) + her hedef alanın **kendi export başlığını** (`IMPORT_FIELD_LABELS`) otomatik eşanlamlı olarak türeten `HEADER_SYNONYMS_WITH_LABELS` ile CSV başlıklarını `IMPORT_TARGET_FIELDS`'a eşler. Bu, **export → re-import round-trip**'in hiçbir elle eşleştirme gerektirmemesini garanti eder — dışa aktarılan bir dosya doğrudan geri içe aktarılabilir (birim testle doğrulandı: `import-products.test.ts`, 18/18 export başlığı).

Türkçe büyük "İ" tuzağı: JS'in yerelleştirme-duyarsız `.toLowerCase()`'i "İ"yi (U+0130) düz "i"ye değil "i" + birleşen nokta işaretine çevirir — `normalizeHeader()` bunu elle düzeltir, aksi halde "İndirimli Fiyat" gibi başlıklar otomatik eşleşmezdi.

## Doğrulama ve hata raporu (Bölüm 24-25)

`validateImportRows()` her satır için: zorunlu alan kontrolü (`name`, `sku`, `category`, `price`), dosya-içi SKU/barkod çakışması (satır numaralarıyla), DB'de kategori/marka bulunabilirliği (**import otomatik kategori/marka oluşturmaz** — önce admin panelinden oluşturulmalı), fiyat/stok/KDV için TR-uyumlu sayı ayrıştırma (`"1.234,56"` → `1234.56`), geçerli birim kontrolü, TR evet/hayır boolean ayrıştırma. Hatalı satır `action: "SKIP"` olur ve import'a **dahil edilmez**; benzer isim tespiti (bkz. `product-management.md`) hard block değil, yalnızca uyarı üretir.

Hata mesajları kullanıcıya `"Satır N: <açıklama>"` biçiminde gösterilir (N = CSV'deki gerçek satır no, başlık=1).

## Batch transaction stratejisi (Bölüm 38)

Büyük importlarda **tek dev transaction yerine** 100 satırlık batch'ler, her biri kendi `$transaction`'ı içinde uygulanır — SQLite'ta tek bir çok-bin-satırlık transaction pratik değil ve yarıda kesilirse geri alma maliyeti yüksek. Her batch'in başarı sayaçları (`batchCreated`/`batchUpdated`) yalnızca o batch'in transaction'ı **başarıyla tamamlandıktan sonra** global sayaçlara eklenir — bir batch başarısız olursa yalnızca o batch'teki satırlar hatalı işaretlenir, önceki başarılı batch'ler geri alınmaz ama sayaçları da yanlışlıkla düşürülmez.

Sonuç raporu (`ImportJob` + API yanıtı): `totalRows`, `createdCount`, `updatedCount`, `errorCount`, `warningCount` — net olarak "kaç kayıt başarılı / hatalı / güncellendi / yeni" (Bölüm 38 gereksinimi).

Yeni oluşturulan ürünlerin ilk stok hareketi **`MIGRATION` değil**, `RESTOCK` (stok>0) veya `ADJUSTMENT` (stok=0) — çünkü bu, admin'in bilinçli olarak import ettiği bir sayı, "doğrulanmamış" (bkz. `inventory.md`) sayılmaz. Güncellenen ürünlerde stok değiştiyse delta bazlı bir `ADJUSTMENT` hareketi eklenir; değişmediyse hiçbir hareket eklenmez.

`PRODUCT_IMPORT` audit log'a yazılır.

## Dışa aktarma (Bölüm 26)

`GET /api/admin/products/export` — admin ürün listesiyle **birebir aynı** filtre parametreleri (`search`, `categoryId` +alt ağaç, `brandId`, `active`, `stock`). UTF-8 BOM'lu CSV, 18 sütun (`IMPORT_FIELD_LABELS` ile birebir aynı başlıklar — round-trip garantisi buradan gelir), 50.000 satır sınırı. **Yalnızca `ADMIN`/`SUPER_ADMIN`** erişebilir (`STAFF` değil) — çünkü export "Maliyet Fiyatı" sütunu içerir, bu da toplu kâr marjı verisi anlamına gelir (bkz. `security.md`). `PRODUCT_EXPORT` audit log'a yazılır.
