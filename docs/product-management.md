# Ürün Yönetimi (FAZ 2)

## Sekmeli ürün formu (Bölüm 8)

`/admin/products/new` ve `/admin/products/:id` (`src/components/ProductForm.tsx`), 8 sekme:

1. **Genel** — ad, SKU, barkod, marka, kategori, kısa/uzun açıklama, aktif/öne çıkan
2. **Fiyat** — satış fiyatı, karşılaştırma fiyatı, kampanya dışı indirim (`salePrice`), maliyet fiyatı, KDV; **marj** (`(satış-maliyet)/satış`) admin'e gösterilir, müşteri tarafında hiç görünmez
3. **Stok** — bkz. `inventory.md`
4. **Görseller** — bkz. aşağıda
5. **Varyantlar** — FAZ 1'den (ürün başına ölçü/renk vb. varyant satırları)
6. **SEO** — `seoTitle`/`seoDescription`, otomatik önerilmez/kaydedilmez
7. **Özellikler** — bkz. aşağıda (dinamik attribute sistemi)
8. **Satış / Görünürlük** — aktif/pasif, öne çıkan, sıralama

## Dinamik ürün özellikleri (Bölüm 10)

Bitki/hortum/tohum gibi çok farklı ürün tiplerinin farklı özellik setlerine ihtiyacı olduğu için özellikler `Product` tablosuna hard-code edilmedi. İki tablo:

- `ProductAttributeDefinition` — `key` (makine-okunur), `name` (insan-okunur), `type` (`TEXT`/`NUMBER`/`BOOLEAN`/`SELECT`), `unit` (ör. "cm", "°C"), `optionsJson` (SELECT için), `categoryId` (**null = tüm kategorilerde kullanılabilir global özellik**, doluysa yalnızca o kategoride)
- `ProductAttributeValue` — `productId` + `attributeDefinitionId` + `value` (her tip metin olarak tutulur, yorumlama uygulama katmanında `type`'a göre yapılır)

`/admin/attributes` ekranından tanım CRUD; ürün formunun "Özellikler" sekmesi, seçili kategoriye uygun (kategoriye özel + global) tanımları listeler ve değer girişi alır.

## Birim sistemi (Bölüm 11)

`PRODUCT_UNITS` (`src/lib/enums.ts`): `ADET`, `KG`, `GRAM`, `GRAM_100`, `LITRE`, `METRE`, `METREKARE`, `PAKET`, `SET`, `RULO`, `CIFT`. Fiyat gösterimi her yerde `PRODUCT_UNIT_LABELS[unit]` ile ("TL/mt", "TL/m²" vb.) tutarlı — hem admin hem public API/sayfalarda aynı eşleme kullanılır.

## Ürün duplicate kontrolü (Bölüm 27)

`src/lib/duplicate-check.ts` — **deterministik, AI kullanılmaz**:

- `SAME_SKU` / `SAME_BARCODE` — tam eşleşme (SKU zaten DB'de `@unique`, bu ek olarak kullanıcıya erken/açıklayıcı bir mesaj verir)
- `SIMILAR_NAME` — normalize edilmiş (Türkçe karakter + case-insensitive) isimler arası Levenshtein mesafesi, eşik = normalize uzunluğun ~%15'i (min 1, max 4 karakter)

Bunların hiçbiri **hard block değildir** — ürün oluşturma/güncelleme API'si `duplicateWarnings` alanıyla admin'e bilgi verir, işlemi engellemez. Aynı fonksiyon CSV içe aktarmada da kullanılır (bkz. `import-export.md`). Birim testler: `duplicate-check.test.ts`.

## Ürün görselleri (Bölüm 28)

`ProductImage`: `url`, `altText`, `sortOrder`, `isPrimary`, `isMobilePrimary`. Bir üründe en fazla bir `isPrimary` ve bir `isMobilePrimary` görsel olabilir — biri `true` yapıldığında diğerleri otomatik `false`'a çekilir (`PATCH /api/admin/products/:id/images/:imageId`). Sıralama, admin panelinde yukarı/aşağı butonlarıyla iki görselin `sortOrder`'ını takas ederek değişir. Görsel silme **hard delete**'tir (galeri öğesi, denetlenebilirlik gerektiren bir iş kaydı değil) ama silme işlemi yine de `PRODUCT_UPDATE` olarak audit log'a yazılır; ana/mobil-ana görsel değişimi de (müşteriye görünen içeriği etkilediği için) audit loglanır — yalnızca sıralama/alt metin gibi kozmetik değişiklikler loglanmaz.

Yükleme güvenliği (`/api/admin/upload`, FAZ 1'den korunuyor): MIME whitelist, boyut sınırı, güvenli dosya adı üretimi.

## Ürün toplu işlemleri (Bölüm 22)

`/admin/products` listesinde çoklu seçim + `POST /api/admin/products/bulk-action`. Desteklenen işlemler: `ACTIVATE`, `DEACTIVATE`, `ARCHIVE`, `SET_CATEGORY`, `SET_BRAND`, `SET_FEATURED`, `UNSET_FEATURED`, `ADD_TO_CAMPAIGN`, `REMOVE_FROM_CAMPAIGN`. Toplu **fiyat** değişikliği kasıtlı olarak burada yok — o zaten kendi (önizlemeli) ucunda, bkz. `pricing.md`; aynı işi iki yerde iki farklı şekilde yapmamak için.

Her toplu işlem: var olmayan ürün id'lerini önce filtreler (sessizce yutmak yerine gerçek etkilenen sayıyı netleştirir), tek bir DB işlemi (`updateMany`/`deleteMany`, veya kampanya ekleme için `$transaction`) içinde uygulanır, `PRODUCT_BULK_ACTION` olarak audit log'a yazılır (hangi ürünler, hangi işlem, kim, ne zaman).

## Server-side pagination ve arama (Bölüm 35/36/37)

Bkz. `database.md` — indexler; `/admin/products` hiçbir zaman tüm ürünleri tek seferde çekmez, `page`/`pageSize` (20/50/100) ile sunucu tarafında sayfalanır.
