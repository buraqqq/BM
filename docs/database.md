# Database — B&M Vourla FAZ 1

## Motor

**SQLite**, dosya: `prisma/dev.db` (`.gitignore`'da — repo'ya dahil edilmez). Bağlantı `DATABASE_URL` ortam değişkeninden okunur (bkz. `environment.md`).

**Serverless/kalıcı-disksiz platforma taşınma:** `prisma/schema.prisma` içindeki `datasource db { provider = "sqlite" ... }` satırını `provider = "postgresql"` yapıp `DATABASE_URL`'i hosted bir Postgres'e (Neon, Supabase, RDS) veya libSQL/Turso'ya çevirin, `npx prisma migrate deploy` çalıştırın. Şemanın geri kalanı değişmeden çalışır — tek istisna: SQLite native enum desteklemediği için tüm "enum" alanlar bilinçli olarak `String` tutuluyor (bkz. aşağıdaki not); Postgres'e geçince bunlar isteğe bağlı olarak gerçek Postgres enum'larına dönüştürülebilir ama zorunlu değildir.

## Neden native enum yok

Prisma + SQLite kombinasyonu native `enum` tipini desteklemiyor (migration sırasında hata verir — bu FAZ 1 sırasında bizzat karşılaşılıp düzeltilen bir sorundur). Bu yüzden `AdminRole`, `ProductUnit`, `StockStatus`, `InventoryMovementType`, `CampaignDiscountType`, `CampaignScope` gibi tüm "kapalı küme" alanlar veritabanında `String` olarak tutulur; izin verilen değerler **tek bir yerde**, `src/lib/enums.ts` içinde tanımlıdır ve API katmanında Zod ile zorunlu kılınır. Şemadaki her ilgili alanın üzerinde bunu belirten bir yorum vardır.

## Varlıklar (Bölüm 3 gereksinimi — tamamı uygulandı)

| Varlık | Prisma modeli | Not |
|---|---|---|
| USER | `User` | Şu an hiçbir özellik buna bağlı değil — FAZ 2+ e-ticaret için temel |
| ADMIN USER / ROLE | `AdminUser` (role: String) | bcrypt hash, rol DB'de |
| PRODUCT | `Product` | Bkz. aşağıdaki alan tablosu |
| CATEGORY | `Category` | 7 kayıt, migrasyonla dolduruldu |
| SUBCATEGORY | `SubCategory` (FAZ1) + `Category.parentId`/`path`/`depth` (FAZ2) | FAZ 2'de `Category` kendi kendine referans veren gerçek bir ağaca dönüştü (materialized path — bkz. `catalog.md`); eski `SubCategory` tablosu geriye dönük uyumluluk için şemada duruyor ama yeni admin akışı kategori hiyerarşisini `Category.parentId` ile kuruyor. Gerçek veride hâlâ hiç alt kategori yok (FAZ 2 mimariyi hazırladı, veriyi otomatik doldurmadı) |
| PRODUCT IMAGE | `ProductImage` | FAZ 2'de admin panelinden yükleme/sıralama/ana-mobil ana görsel/alt metin ile aktif kullanımda (bkz. `product-management.md`); `isMobilePrimary` alanı FAZ 2'de eklendi |
| PRODUCT VARIANT | `ProductVariant` | Şema hazır, henüz kullanılmıyor |
| INVENTORY | `Inventory` + `InventoryMovement` | Her ürün için migrasyonla oluşturuldu (bkz. migration.md — varsayılan miktar notu) |
| PRICE | `PriceHistory` | Her fiyat değişikliğinde otomatik kayıt |
| CAMPAIGN | `Campaign` | Tarih bazlı otomatik aktiflik (bkz. architecture.md) |
| CAMPAIGN PRODUCT | `CampaignProduct` | PRODUCT kapsamlı kampanyalar için join tablo |
| BANNER | `Banner` | Tarih bazlı otomatik görünürlük |
| AUDIT LOG | `AuditLog` | Bkz. security.md |
| ADDRESS | `Address` | FAZ 2+ e-ticaret için temel |
| SETTINGS | `Setting` | Bize Ulaşın bilgileri artık burada (bkz. migration.md) |

## Product modeli — alan tablosu (Bölüm 4/7)

| Alan | Tip | Durum |
|---|---|---|
| id | String (cuid) | ✅ |
| sku | String, unique | ✅ (migrasyonda otomatik üretildi: `BM-<KATEGORİ>-<sıra>`) |
| barcode | String?, unique | ✅ (opsiyonel, şu an hiçbir üründe yok) |
| name | String | ✅ |
| slug | String, unique | ✅ (Türkçe karakter dönüşümlü otomatik üretim, bkz. `src/lib/slug.ts`) |
| category | → Category | ✅ FK |
| subcategory | → SubCategory? | ✅ FK, opsiyonel |
| brand | → Brand? | ✅ FK, opsiyonel — FAZ 2'de `/admin/brands` CRUD ekranı ve ürün formunda marka seçimi eklendi |
| shortDescription / description | String? | ✅ |
| images | → ProductImage[] | ✅ ayrı tablo |
| price | Decimal | ✅ |
| compareAtPrice | Decimal? | ✅ |
| salePrice | Decimal? | ✅ (manuel indirim, kampanyadan bağımsız) |
| costPrice | Decimal? | ✅ (yalnızca admin görür) |
| taxRate | Decimal | ✅ (varsayılan %20) |
| stock | — | ✅ ama **ayrı tabloda** (`Inventory`), Product üzerinde düz alan olarak DEĞİL |
| stockStatus | — | ✅ `Inventory.stockStatus` |
| unit | String (enum) | ✅ |
| weight | Float? | ✅ |
| dimensions | String? (JSON) | ✅ (SQLite'ta serbest JSON metni) |
| attributes | String? (JSON) | ✅ |
| tags | → ProductTag[] | ✅ ayrı M:N tablo |
| variants | → ProductVariant[] | ✅ ayrı tablo |
| seoTitle / seoDescription | String? | ✅ |
| isActive | Boolean | ✅ |
| isFeatured | Boolean | ✅ |
| createdAt / updatedAt | DateTime | ✅ |

**Ayrı tabloya taşınan alanlar ve neden:** `images`, `variants`, `tags`, `stock` (Inventory) — bunlar Product üzerinde düz alan olarak tutulsaydı (ör. tek bir "resim URL'i" alanı, tek bir "stok sayısı" alanı) çoklu görsel, çoklu varyant, stok hareket geçmişi gibi ihtiyaçlar karşılanamazdı. `category`/`subcategory`/`brand` de kendi tablolarında çünkü aynı kategori birçok üründe tekrar eder — düz metin olarak tutulsaydı normalize olmayan, "kategori adını değiştir" gibi bir işlemi 257 satırda tekrarlamayı gerektiren bir yapı ortaya çıkardı (FAZ 0'da tam olarak bu problem — pazarlama metninin koddan drift etmesi — tespit edilmişti).

## Veri bütünlüğü kısıtları (Bölüm 22)

| Kısıt | Nerede |
|---|---|
| SKU unique | `Product.sku @unique`, DB seviyesinde |
| Slug unique | `Product.slug`, `Category.slug`, `Campaign.slug` — hepsi `@unique` |
| Zorunlu alanlar NOT NULL | `name`, `price`, `categoryId` vb. şemada `?` işaretsiz |
| Foreign key | Tüm ilişkiler Prisma `@relation` ile FK olarak kurulu (SQLite'ta FK enforcement aktif) |
| Geçersiz fiyat engeli | Zod: `price` pozitif ve max 10.000.000; ayrıca kampanya `%` indirimi 100'ü aşamaz |
| Negatif stok politikası | `PATCH /api/admin/inventory/:productId` — sonuç negatif olacaksa `400 NEGATIVE_STOCK` ile reddedilir (test edildi, bkz. security.md) |
| Geçersiz kampanya tarihleri | Zod `refine`: `endDate > startDate` zorunlu, hem create hem update'te |

## Migration sistemi (Bölüm 23)

Prisma Migrate kullanılıyor (`npx prisma migrate dev` / `deploy`). Migration dosyaları `prisma/migrations/` altında, version-controlled (git'e dahil). İlk migration: `20260826081957_init`. Production'a her yeni şema değişikliği `prisma migrate deploy` ile, elle SQL çalıştırılmadan uygulanmalıdır.

## FAZ 2 şema değişiklikleri

FAZ 2 boyunca eklenen tüm alanlar **additive**'dir (mevcut hiçbir kolon kaldırılmadı/tipi değiştirilmedi, geriye dönük uyumluluk korundu):

| Migration | Değişiklik |
|---|---|
| `20260826090944_faz2_catalog_schema` | Tek büyük FAZ 2 temel migration'ı: `Category.parentId`/`path`/`depth` (materialized path, bkz. `catalog.md`), `ProductAttributeDefinition`/`ProductAttributeValue` (Bölüm 10 — dinamik özellikler), `ImportJob` tablosu (Bölüm 23/38) ve ilişkili FAZ 2 katalog alanları |
| `20260826100427_product_image_mobile_primary` | `ProductImage.isMobilePrimary Boolean @default(false)` |
| `20260826100844_product_search_indexes` | `@@index([brandId])`, `@@index([name])` — Bölüm 35/36/37 (10.000+ ürün ölçeği için) |

### İndeksler ve arama (Bölüm 35/36)

`Product` üzerinde: `categoryId`, `brandId`, `isActive`, `name` indeksli. **Önemli kısıtlama**: SQLite'ta standart bir B-tree index, `LIKE '%terim%'` (baştan joker karakterli) alt dize aramasını hızlandırmaz — yalnızca `ORDER BY name` ve `LIKE 'terim%'` (baştan sabit) sorgularını hızlandırır. Şu anki 257 ürünlük ölçekte admin arama ekranındaki `contains` sorgusu sorun yaratmıyor; katalog birkaç bin ürüne ulaştığında bu, SQLite FTS5 (full-text search) sanal tablosuna geçiş gerektirecektir — kod içinde bu nokta işaretlenmiştir (`src/app/api/admin/products/route.ts`), FAZ 2 kapsamında henüz uygulanmadı.

Admin ürün listesi ve tüm toplu işlem/export uçları **server-side pagination** kullanır (`page`/`pageSize`, API'de `pageSize` üst sınırı 200) — hiçbir uç tüm ürünleri tek seferde belleğe çekmez.
