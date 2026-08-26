# Katalog — Kategori, Marka, URL Mimarisi (FAZ 2)

## Kategori hiyerarşisi (Bölüm 3/4)

`Category` modeli artık gerçek bir ağaç yapısı destekliyor: `parentId` (self-relation) + **materialized path** (`path`, `depth`). Path formatı `/<ata1Id>/.../<selfId>/` — kök kategori `/kendiId/`, iki seviye alt kategori `/ata1/ata2/kendiId/` şeklinde.

Bu yaklaşım seçildi çünkü SQLite'ta Prisma üzerinden recursive CTE doğal desteklenmiyor; `path LIKE 'prefix%'` (indexed) ile "bu kategori + tüm alt ağacı" sorgusu tek, basit ve performanslı bir sorguya iniyor. Bkz. `src/lib/category-tree.ts`:

- `computePath(parent, selfId)` — saf fonksiyon, yeni path hesaplar (birim testli, bkz. `category-tree.test.ts`)
- `planCategoryCreate(parentId, selfId)` — yeni kategori için path/depth hesaplar
- `moveCategory(categoryId, newParentId)` — bir kategoriyi (ve tüm alt ağacını, transaction içinde) yeni bir parent'ın altına taşır; döngü koruması var (bir kategori kendi alt ağacının altına taşınamaz)
- `getCategorySubtreeIds(categoryId)` — kendisi dahil tüm alt ağacın id listesini döner; toplu fiyat revizyonu, CATEGORY kapsamlı kampanya ve admin ürün filtresi bunu kullanır

Şu anki gerçek veride (257 ürün, 7 kategori) hiç alt kategori yok — ancak mimari, kullanıcının FAZ 2 isteğinde listelenen çok seviyeli bahçe ekosistemi kategorilerini (Bahçe Bitkileri > Çiçek/Ağaç/Çalı, Sulama > Hortum/Damlama, vb.) doğrudan destekleyecek şekilde kuruldu. Bu kategoriler **otomatik oluşturulmadı** — admin panelinden (`/admin/categories`) elle, ihtiyaç oldukça eklenir.

### Kategori admin ekranı

`/admin/categories`: oluştur / düzenle / pasifleştir / sıralama / parent değiştir (taşıma) / SEO alanları / görsel. **Hard delete yok** — `DELETE /api/admin/categories/:id` her zaman `405 HARD_DELETE_DISABLED` döner; ürünlerin bağlı olduğu bir kategori "silinmek" istenirse `PATCH {isActive:false}` kullanılır.

## Marka yönetimi (Bölüm 6)

`Brand` modeli: `name`, `slug`, `logoUrl`, `description`, `website`, `isActive`, `seoTitle`, `seoDescription`. `/admin/brands` ekranından CRUD. Ürünler `brandId` ile ilişkilendirilir — marka adı hiçbir yerde düz metin olarak tekrarlanmaz (FAZ 1'de zaten böyle değildi, korunmadı çünkü zaten yoktu). Marka da kategoriyle aynı "hard delete yok" kuralına tabi (`DELETE` → 405, `PUT {isActive:false}` kullanılır).

## URL mimarisi (Bölüm 25/30)

FAZ 1'in ana sayfası (`/`, tek sayfalık, kategori tıklanınca modal açan deneyim) **hiç değiştirilmedi**. Buna ek olarak, SEO ve derin bağlantı için iki yeni herkese açık sayfa eklendi:

- `/urun/:slug` — tek ürün detay sayfası (`src/app/urun/[slug]/page.tsx`)
- `/kategori/:slug` — kategori + alt kategoriler + o kategorideki ürünler (`src/app/kategori/[slug]/page.tsx`)

İkisi de mevcut `/api/products/:slug` ve `/api/categories` uçlarını (server component içinde `apiGet` ile) kullanır — public API katmanına yeni bir uç eklenmedi. `generateMetadata()` her ikisinde de `seoTitle`/`seoDescription` alanlarına düşer (yoksa ürün adı/kategori başlığı ve kısa açıklamaya fallback yapar).

**Yönlendirme planı gerekmedi**: FAZ 1'de `/urun/...` veya `/kategori/...` altında hiçbir eski URL yayında değildi (tek sayfa + hash/modal mimarisiydi), bu yüzden bu iki yeni rota **hiçbir mevcut URL'yi kırmıyor** — ek, saf bir genişleme.

**ÇÖZÜLDÜ — CATEGORY TREE PRODUCT AGGREGATION (FAZ 3, Bölüm 2)**: FAZ 2.1 QA turunda bırakılan TODO burada kapatıldı. `/api/products` artık `subtree=1` parametresiyle `getCategorySubtreeIds()`'i kullanarak seçilen kategori + TÜM alt kategorilerindeki ürünleri getirebiliyor (bkz. `src/lib/search.ts`); `/kategori/:slug` sayfası bu parametreyi her zaman açık gönderiyor (`src/app/kategori/[slug]/page.tsx`) — artık üç seviyeli bir A > B > C hiyerarşisinde A sayfasının ürün listesi C'deki ürünleri de kapsıyor. `subtree=1` verilmediğinde (`/api/products?category=` eski haliyle) davranış FAZ 2'deki gibi kaldı — geriye dönük uyumluluk için varsayılan kapalı.

Kasıtlı olarak DEĞİŞMEYEN kısım: "Alt Kategoriler" bölümü hâlâ yalnızca **doğrudan** alt kategorileri (bir seviye) listeliyor — bu, standart bir e-ticaret navigasyon deseni (A sayfası B'yi gösterir; C'yi görmek isteyen B'ye girer), bir eksiklik değil. Asıl eksik olan "ürün aggregation" kısmıydı, o çözüldü.

Gerçek veride hâlâ hiç alt kategori olmadığı için (`Category` tablosunda 7 kayıt, hepsi kök) bu davranış canlı, çok seviyeli gerçek veriyle test edilemedi — yalnızca kod seviyesinde ve `src/lib/__tests__/search.test.ts`'teki `buildProductSearchWhere` birim testiyle doğrulandı.

## Ürün SEO alanları

Her ürün ve kategoride `seoTitle`/`seoDescription` (opsiyonel, admin panelinden düzenlenir). Boşsa otomatik bir öneri **hesaplanmaz ve otomatik kaydedilmez** (Bölüm 29 gereksinimi) — yalnızca sayfa render'ında fallback olarak ürün adı/kısa açıklama kullanılır, DB'ye hiçbir şey yazılmaz.

## Fiyata göre sıralama — final (satış) fiyatı ve gelecek notu (FAZ 3.1, Bölüm 1/2)

`/api/products?sort=price_asc|price_desc` (dolayısıyla `/urunler`, `/kategori/:slug`, `/arama`) artık DB'deki liste fiyatına değil, kampanya/manuel indirim uygulanmış **gerçek satış (final) fiyatına** göre sıralıyor — bkz. `src/lib/price-sort.ts`. Fiyat hesaplama mantığı burada **ikinci kez yazılmadı**; `src/lib/pricing.ts`'teki `computeFinalPrice` (tek doğruluk kaynağı) doğrudan kullanılıyor.

**Neden tam bir SQL `ORDER BY final_price` yok**: final fiyat, kampanyaların tarih/kapsam durumuna göre çalışma zamanında hesaplanan türetilmiş bir değer — SQLite'ta sorgulanabilir bir sütun değil. Bunu doğrudan SQL'de (CASE/subquery ile) hesaplamak, `computeFinalPrice`'ın kampanya/indirim mantığını farklı bir dilde (SQL) yeniden yazmak anlamına gelirdi — bu açıkça istenmedi.

**Uygulanan geçici (ama naif olmayan) çözüm**: indirimden etkilenebilecek ürünler (salePrice dolu + aktif PRODUCT/CATEGORY kapsamlı kampanyaların hedefleri) sınırlı bir alt küme olarak hesaplanır; etkilenmeyen çoğunluk zaten SQL'in `ORDER BY price` sıralamasıyla doğru gelir; ikisi merge edilir. Maliyet, kataloğun tamamıyla değil, sayfa derinliği + etkilenen ürün sayısıyla orantılıdır. Tek bilinen, dokümante edilmiş istisna: **aktif bir GLOBAL kapsamlı kampanya** varken (herkesi etkilediği için) filtrelenmiş kümenin tamamı (yalnızca 5 skaler alan, ilişki JOIN'i olmadan) taranır — şu an gerçek veride hiçbir GLOBAL kampanya yok, bu dal yalnızca doğruluk için var ve birim testle kapsanıyor.

**Gerçek/kalıcı çözüm (FAZ 4+ önerisi)**: `Product` tablosuna, kampanya/fiyat değişiminde senkron tutulan materialized bir `effectivePrice` sütunu (veya PostgreSQL'e geçişte bir generated column / trigger) eklemek — bu, final fiyata göre gerçek bir indexed `ORDER BY` sağlar ve 10.000+ ürün + aktif GLOBAL kampanya kombinasyonunda bile O(sayfa boyutu) maliyetli kalır. SQLite + mevcut mimaride bu, kampanya create/update/delete ve ürün price/salePrice/compareAtPrice değişiminin HEPSİNİN bu sütunu güncellemesini gerektirir — kapsamı FAZ 3.1'in "mevcut çalışan sistemi gereksiz karmaşıklaştırma" kısıtıyla çelişeceği için bu fazda yapılmadı.

## Product Image Storage — gelecek ihtiyaç notu (FAZ 3.1, Bölüm 6)

FAZ 3.1 QA turunda `ProductImage` sisteminin uçtan uca (oluşturma API'si, `altText`, `sortOrder`, `isPrimary`/`isMobilePrimary`, ürün detay/ProductCard/JSON-LD render'ı) gerçek bir test görseliyle çalıştığı doğrulandı (bkz. FAZ3.1 raporu Bölüm C) — bu fazda **yeni bir depolama servisi eklenmedi**, yalnızca mevcut kabiliyet doğrulandı. Gerçek üretim ölçeğine geçildiğinde aşağıdakiler ayrı bir FAZ'da ele alınmalı:

- **Local development**: mevcut hâliyle korunmalı — `src/lib/storage.ts`, `STORAGE_LOCAL_PATH=./public/uploads` altına yazıyor, `/uploads/<kategori>/<dosya>` göreli URL'i dönüyor. Geliştirme ortamı için yeterli, değiştirilmesine gerek yok.
- **Production object storage**: S3-uyumlu bir servis (S3, Cloudflare R2, vb.) — `STORAGE_DRIVER` zaten ortam değişkeni olarak var (`"local"`), ileride `"s3"` gibi bir sürücü eklenip `storage.ts`'in arayüzü (`upload(file): {url}`) korunarak geçiş yapılabilir.
- **CDN**: object storage önüne konacak bir CDN (statik görsellerin coğrafi olarak yakın sunulması).
- **Image optimization**: yükleme anında veya CDN katmanında yeniden boyutlandırma/sıkıştırma (şu an hiçbir optimizasyon yok — yüklenen dosya olduğu gibi saklanıyor).
- **Thumbnail**: liste/kart görünümleri (`ProductCard`) için ayrı, küçük boyutlu bir varyant — şu an tüm görünümler aynı orijinal URL'i kullanıyor.
- **Mobile image**: `ProductImage.isMobilePrimary` alanı zaten var (FAZ 2'den) ve galerideki mevcut görsellerden birini mobilde öncelikli işaretlemeye izin veriyor — ayrı bir mobil-optimize dosya YÜKLEMEsi henüz yok, yalnızca mevcut görsellerden seçim var.

**Bu fazda eklenmedi**: S3/Cloudinary/Cloudflare Images gibi harici bir servis entegrasyonu, görsel optimizasyon pipeline'ı, thumbnail üretimi. Bunlar kullanıcının açık isteğiyle "bu fazın kapsamı dışı" tutuldu (bkz. FAZ3.1 talimatı Bölüm 6).

**Bilinen, düzeltilmeyen (kasıtlı) davranış — image URL validation**: `POST /api/admin/products/:id/images`'teki `url` alanı yalnızca `z.string().min(1).max(1000)` ile doğrulanıyor, `.url()` formatı ZORUNLU KILINMIYOR. Bu bir gözden kaçma değil — `src/lib/storage.ts`'in döndürdüğü gerçek yükleme URL'leri `/uploads/urunler/<dosya>` gibi GÖRELİ path'lerdir (mutlak URL değil); `.url()` doğrulaması eklenirse mevcut yükleme akışı KIRILIRDI. FAZ3.1'de bu nedenle bilerek DEĞİŞTİRİLMEDİ — doğru düzeltme, göreli path'leri de kabul eden özel bir doğrulama (regex veya "göreli path OU mutlak URL" birleşik şeması) olurdu, ayrı bir iterasyon gerektirir.
