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

**Bilinen basitleştirme — TODO(CATEGORY TREE PRODUCT AGGREGATION)**: `/kategori/:slug` sayfası yalnızca **bir seviye** doğrudan alt kategori ve yalnızca **doğrudan** bağlı ürünleri listeler, tam alt ağaç toplaması yapmaz. FAZ 2.1 QA turunda kod seviyesinde doğrulandı (`src/app/kategori/[slug]/page.tsx`): üç seviyeli bir A > B > C hiyerarşisinde, A sayfası B'yi (tek seviye) gösterir ama C'yi hiçbir yerde göstermez; A sayfasının ürün listesi yalnızca `categoryId` doğrudan A'ya eşit ürünleri içerir — B veya C'ye atanmış ürünler dahil olmaz (`/api/products?category=` filtresi `Product.categoryId` üzerinden tam eşleşme yapıyor, alt ağaç değil). Gerçek veride şu an hiç alt kategori olmadığı için bu davranış canlı olarak test edilemedi. Alt kategoriler eklendiğinde iki nokta `getCategorySubtreeIds()` (zaten toplu fiyat/kampanya kapsamında kullanılıyor) ile genişletilmeli: (1) `children` rekürsif/ağaç render'a, (2) ürün sorgusu `categoryId in subtreeIds`'e geçirilmeli. Kod içinde aynı TODO işaretlendi.

## Ürün SEO alanları

Her ürün ve kategoride `seoTitle`/`seoDescription` (opsiyonel, admin panelinden düzenlenir). Boşsa otomatik bir öneri **hesaplanmaz ve otomatik kaydedilmez** (Bölüm 29 gereksinimi) — yalnızca sayfa render'ında fallback olarak ürün adı/kısa açıklama kullanılır, DB'ye hiçbir şey yazılmaz.
