# FAZ 3.1 — Tamamlanma Raporu
**Storefront Final Price Sorting + Commerce Readiness QA**
Tarih: 2026-08-26

Kapsam talimatına sadık kalındı: **yeni büyük özellik geliştirilmedi**, **mevcut storefront mimarisi yeniden yazılmadı**. Yalnızca istenen iki konu (fiyat sıralaması + ticari altyapı QA'sı) ele alındı.

---

## A — Final price sorting

`/urunler` (ve `/api/products`) üzerindeki `sort=price_asc` / `sort=price_desc` artık **DB liste fiyatı yerine gerçek satış (final) fiyatına** göre sıralıyor — kampanya indirimi ve manuel `salePrice` dahil.

Doğrulama (canlı, gerçek DB): `TEST-FAZ31-D` (100 TL), `TEST-FAZ31-A` (liste 1000 → salePrice 700), `TEST-FAZ31-B` (750 TL), `TEST-FAZ31-C` (liste 1200, aktif %30 PRODUCT-kampanya → 840 TL) ile self-cleaning script çalıştırıldı:
- ASC sonucu: `D(100), A(700), B(750), C(840)` ✅
- DESC sonucu: `C(840), B(750), A(700), D(100)` ✅

Sorudaki örnek senaryo (A: liste 1000, %30 kampanya → 700; B: liste 750, kampanyasız → 750; "düşükten yükseğe" → A önce, B sonra) hem birim testte (Test 2) hem canlı script'te birebir doğrulandı.

## B — Pricing engine integration

Fiyat hesaplama mantığı **ikinci kez yazılmadı**. `src/lib/price-sort.ts`, `src/lib/pricing.ts`'teki `computeFinalPrice` fonksiyonunu (tek doğruluk kaynağı — `serializePublicProduct` ve admin price-explain endpoint'inin de kullandığı fonksiyon) doğrudan çağırıyor.

Performans (10.000+ ürün hedefi) için "tümünü çek + JS'de sırala" **yapılmadı**. Bunun yerine:
- İndirimden etkilenebilecek küçük alt küme (salePrice dolu / aktif PRODUCT-kampanya hedefi / aktif CATEGORY-kampanya alt ağacı) hedefli, indexed sorgularla belirlenip yalnızca bu küme için `computeFinalPrice` çalıştırılıyor.
- Etkilenmeyen çoğunluk için final fiyat = liste fiyatı olduğundan, SQL'in kendi `ORDER BY price`'ı zaten doğru — bu ürünlerden yalnızca `offset + pageSize + etkilenenSayısı` kadarı çekiliyor (kataloğun tamamı değil).
- İki zaten-sıralı liste klasik iki-işaretçili merge (`mergeSortedScored`) ile birleştirilip sayfa dilimleniyor.
- **Dokümante edilmiş istisna**: aktif bir GLOBAL-kapsamlı kampanya varsa (şu an gerçek veride yok), bu strateji işlemez çünkü GLOBAL kampanya tanımı gereği tüm ürünleri etkiler — bu durumda yalnızca 5 skaler alan (JOIN'siz) ile tam tarama yapılır. Gerçek uzun vadeli çözüm (materialized `effectivePrice` sütunu veya PostgreSQL generated column) `docs/catalog.md`'de not edildi, bu fazda **uygulanmadı** ("çalışan sistemi gereksiz karmaşıklaştırma" talimatına uyularak).

Detaylı mimari gerekçe `src/lib/price-sort.ts` başlığında ve `docs/catalog.md`'de Türkçe olarak belgelendi.

## C — Image capability verification

Gerçek fotoğraf toplanmadı/uydurulmadı. Mevcut `ProductImage` sistemi, gerçek admin oturumu (NextAuth credentials flow, csrf token) ile uçtan uca test edildi (`b-m-mangal-bahari-imza` ürünü üzerinde, geçici bir görsel kaydıyla):

| Kontrol | Sonuç |
|---|---|
| Oluşturma API'si (`POST /api/admin/products/:id/images`) | ✅ Çalışıyor, `sortOrder`/`isPrimary` otomatik doğru |
| `alt` metni | ✅ Kaydediliyor, doğru dönüyor |
| `sortOrder` | ✅ |
| Primary image mantığı | ✅ İlk görsel otomatik primary |
| `isMobilePrimary` güncelleme (PATCH) | ✅ |
| Ürün detay sayfası render | ✅ (`/urun/b-m-mangal-bahari-imza`) |
| `ProductCard` thumbnail render | ✅ (`/kategori/baharat`) |
| Product JSON-LD `image` alanı | ✅ Dolu dönüyor |
| Silme (`DELETE .../images/:imageId`) | ✅ Temizlendi, 0 görsel kaldı |

**Bulunan ama bilinçli DÜZELTİLMEYEN gap**: `addImageSchema.url` alanı gerçek URL formatını zorlamıyor (`z.string().min(1).max(1000)`, `.url()` değil). Sebebi: mevcut local-upload akışı (`src/lib/storage.ts`) göreli path döndürüyor (`/uploads/...`) — `.url()` eklemek bu gerçek akışı kırardı (regresyon olurdu). Karar: düzeltilmedi, `docs/catalog.md`'de nedeniyle belgelendi. Yeni upload/storage sistemi **eklenmedi** (talimat gereği).

## D — Cart schema QA

`Cart`/`CartItem` şemasına hiçbir yeni model eklenmedi. Order/Payment/Shipping/Gel-Al **oluşturulmadı**. Üç senaryo incelendi (`docs/commerce.md`'de tablo halinde):

| Senaryo | Sonuç |
|---|---|
| Product hard-delete | `ON DELETE CASCADE` gerçek `migration.sql`'de doğrulandı — orphan `CartItem` oluşamaz. (Ayrıca hard-delete zaten API'de 405 ile engelli.) |
| Product arşivlenirse (`isActive=false`) | Soft delete, FK'ye dokunmuyor — şema sorunsuz. İleride gerçek sepet UI'ı yazılırken `product.isActive` kontrolü gerekeceği not edildi. |
| Product fiyatı değişirse | `unitPriceAtAdd` kasıtlı bir snapshot, otomatik senkronize olmuyor — standart e-ticaret davranışı, orphan riski yok. |

## E — AI product matching documentation

`docs/commerce.md`'ye yalnızca dokümantasyon olarak eklendi: **AI Requirement → Category → Product Attributes → SKU → Inventory → Final Customer Price → Cart** zinciri, her halka gerçek koddaki karşılığına (`category-tree.ts`, `ProductAttributeDefinition/Value`, `Product.sku`+`search.ts`, `Inventory.stockStatus`, `pricing.ts computeFinalPrice`+yeni `price-sort.ts`, `Cart/CartItem`) referansla eşlendi. **Hiçbir AI API'si veya öneri motoru geliştirilmedi.**

## F — Tests

`npm test -- --run`: **108/108 geçti** (97 → 108, +11 yeni test — istenen 7 zorunlu senaryo + 4 `mergeSortedScored` testi). Tüm mevcut FAZ 3 testleri de geçmeye devam ediyor.

## G — Build

`npx tsc --noEmit`: temiz (0 hata).
`npm run build`: başarılı, hatasız.

## H — DB integrity

Son kontrol (`scripts/db-integrity-check.ts`):
- 260 ürün (257 aktif + 3 arşiv) ✅ beklenenle birebir
- 0 orphan, 0 duplicate ✅
- Test verisi (FAZ3.1 script'inin oluşturduğu 4 ürün + 1 kampanya + 1 campaign-product) **tamamen temizlendi**, kalıcı iz bırakılmadı.
- ProductImage test kaydı da temizlendi (0 kaldı, C bölümünde açıklandığı gibi).

## I — Git commit

Tek commit: **`51a52b8 fix(storefront): sort products by final customer price`**
İçerik: `src/lib/price-sort.ts` (yeni), `src/app/api/products/route.ts` (değişti), `src/lib/__tests__/price-sort.test.ts` (yeni), `scripts/faz31-price-sort-live-check.ts` (yeni), `docs/catalog.md` + `docs/commerce.md` (güncellendi). Şema/migration değişikliği yok.

---

## FAZ 4'E GEÇİLMEDİ

Kullanıcı onayı bekleniyor.
