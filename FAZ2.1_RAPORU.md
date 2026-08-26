# B&M Vourla — FAZ 2.1 Raporu
## DATA INTEGRITY + FINAL QA PATCH

Tarih: 2026-08-26

---

## A — Recovery sonucu

**Kısmen başarılı: Product satırları tam, Inventory/PriceHistory satırları kurtarılamadı (uydurulmadı).**

Araştırılan kaynaklar (kod yazmadan önce):
- `git log --all -p` (tüm branch/commit geçmişi, `BM-BAHARAT-054`/`055` için grep)
- `git reflog`
- Dosya sisteminde `.db`, `.db-journal`, `*.zip`, `backup*` araması
- `prisma/legacy/migration-report.json` (migration özeti: `totalLegacyProducts: 257, migratedCount: 257, flaggedCount: 0`)
- `prisma/legacy/products.legacy.js` (orijinal legacy kaynak — "Baharatlar" kategorisinde yorum satırı `(52)` ile toplam 52 ürün olduğunu doğruluyor: BM-BAHARAT-001…052)
- `.gitignore` (doğrulama: `prisma/dev.db`, `prisma/*.db`, `prisma/*.db-journal` gitignore'da — DB dosyası hiçbir zaman commit edilmemiş)

**Bulgu**: `BM-BAHARAT-053/054/055` legacy migration'ın bir parçası değil — legacy "Baharatlar" kategorisi yalnızca 52 gerçek ürün içeriyor (001-052). Bu üç SKU, FAZ 1 sırasında elle oluşturulmuş test ürünleridir; migration-report.json'da hiç geçmiyorlar. Yani **git geçmişinde, eski migration'da veya bir yedekte "orijinal" bir kaynak yoktu** — hiçbir zaman var olmadılar bu kaynaklarda.

Bulunan tek güvenilir kaynak: **bu oturumun kendi transkripti** — ürünler silinmeden hemen önce, FAZ 2 QA turunda çalıştırılan bir Prisma sorgusunun ham çıktısı olarak tam `Product` satırları (tüm alanlarıyla) yakalanmıştı. Bu veri, harici bir "backup" değil, ama doğrudan veritabanından okunmuş, değiştirilmemiş, gerçek bir kayıttır.

**Geri yüklenen** (`Product` tablosu, orijinal değerlerle, `id` ve `createdAt` dahil):

| Alan | BM-BAHARAT-054 | BM-BAHARAT-055 |
|---|---|---|
| id | `cmt9uaiez001c10c2olwbnyjo` | `cmt9uerk2002d10c2ho4v6cu8` |
| name | `<script>alert(1)</script>XSSTEST` | `E2E TEST ÜRÜNÜ` |
| slug | `script-alert-1-script-xsstest` | `e2e-test-urunu` |
| price | 10 | 1750 |
| isActive | false | false |
| isFeatured | true | false |
| createdAt | 2026-08-26T08:36:12.348Z (orijinal) | 2026-08-26T08:39:30.818Z (orijinal) |

**Kurtarılamayan (KASITLI OLARAK uydurulmadı)**:
- `Inventory` satırları — her iki ürünün de orijinalde bir `Inventory` kaydı vardı, ama tam `quantity`/`lowStockThreshold`/`stockStatus` değerleri bu oturumun transkriptinde yakalanmamıştı. Tahmini bir değer (örn. "muhtemelen 0" veya "muhtemelen düşük stok") yazmak, kullanıcının açık "veri uydurma" yasağını ihlal eder — bu yüzden bu satırlar **oluşturulmadı**.
- `PriceHistory` satırları — kayıt SAYISI biliniyordu (054 için 1, 055 için 2) ama içerikleri (eski fiyat, değişiklik nedeni, zaman damgası) bilinmiyordu — aynı nedenle oluşturulmadı.
- `updatedAt` — Prisma şemasında `@updatedAt` olarak işaretli, bu yüzden her `create`/`update`'te Prisma tarafından otomatik olarak şimdiki zamana yazılır; orijinal tarihsel değere zorlanamaz. Bu, geri yükleme-sonrası kaçınılmaz ve dürüst bir yan etkidir, veri uydurma değildir.

Şema kontrolü: `Product.inventory` alanı **opsiyonel** (`Inventory?`), ve kod tabanındaki tüm `.inventory` okumaları (`serializePublicProduct`, admin ürün listesi/detayı) güvenli optional chaining (`?.`) kullanıyor — bu iki ürünün `inventory: null` olması hiçbir sayfayı/API'yi çökertmiyor, yalnızca bu iki üründe stok/fiyat geçmişi verisi olmadığını dürüstçe yansıtıyor.

---

## B — Database integrity

`scripts/db-integrity-check.ts` çalıştırıldı (salt okunur, hiçbir veri değiştirilmedi):

```
Sayılar: {
  "products": 260,
  "activeProducts": 257,
  "categories": 7,
  "brands": 0,
  "inventories": 258,
  "inventoryMovements": 263,
  "priceHistory": 260,
  "campaignProducts": 1,
  "productImages": 0
}
✅ Hiçbir bütünlük sorunu bulunamadı (0 orphan, 0 duplicate).
```

Kontrol edilenler: orphan `ProductImage`, `Inventory`, `InventoryMovement`, `CampaignProduct`, `PriceHistory`, `ProductAttributeValue`; orphan `Brand` ilişkisi (`Product.brandId`); orphan `Category` ilişkisi (`Product.categoryId`); duplicate SKU/barcode/slug (`Product`); duplicate slug (`Category`). **0 bulgu.**

Not: SQLite'ta gerçek foreign key enforcement aktif olduğu için normal yollardan (Prisma client) yazılan veride orphan satır yapısal olarak oluşamaz — bu script savunma amaçlı/doğrulayıcı niteliktedir, sıfır bulgu beklenen sonuçtur.

---

## C — Baseline durumu

| Kontrol | Beklenen | Gerçekleşen | Durum |
|---|---|---|---|
| Aktif ürün sayısı | 257 | 257 | ✅ |
| Arşiv test ürünleri (BM-BAHARAT-053/054/055) | 3 | 3 | ✅ |
| BM-BAHARAT-053 var, isActive=false | ✅ | ✅ (`FAZ1 TEST ÜRÜNÜ`, hiç dokunulmadı, orijinal Inventory'si de sağlam) | ✅ |
| BM-BAHARAT-054 var, isActive=false | ✅ | ✅ (Product geri yüklendi, Inventory yok) | ✅ |
| BM-BAHARAT-055 var, isActive=false | ✅ | ✅ (Product geri yüklendi, Inventory yok) | ✅ |

---

## D — Category tree kontrolü

Kod seviyesinde incelendi (gerçek veride alt kategori olmadığı için canlı test edilemedi):

- `src/app/kategori/[slug]/page.tsx` → `getCategory()`: `children = items.filter(c => c.parentId === category.id)` — yalnızca **1 seviye doğrudan** alt kategoriyi hesaplıyor.
- Ürün listesi: `apiGet('/api/products?category=' + category.slug)` → `src/app/api/products/route.ts`'te `where.category = { slug: categorySlug }`, yani `Product.categoryId` **doğrudan** o kategoriye eşit olan ürünler getiriliyor.

**Sonuç**: A > B > C hiyerarşisinde, A sayfası B'yi (tek seviye) gösterir ama **C'yi hiçbir yerde göstermez**; A sayfasının ürün listesi yalnızca `categoryId` doğrudan A'ya eşit ürünleri içerir — B veya C'ye atanmış ürünler A sayfasında hiç görünmez. Bu davranış şu aşamada değiştirilmedi (kullanıcı talimatına göre zorunlu değil).

**Bırakılan TODO/dokümantasyon**:
- `src/app/kategori/[slug]/page.tsx` içinde `TODO(CATEGORY TREE PRODUCT AGGREGATION)` yorum bloğu (kod seviyesinde, `getCategory()` fonksiyonunun hemen üstünde).
- `docs/catalog.md` içinde aynı başlıkla eşleşen, A>B>C örnekli açıklama paragrafı.
- Önerilen çözüm yolu her iki yerde de belirtildi: mevcut `getCategorySubtreeIds()` (`src/lib/category-tree.ts`, zaten toplu fiyat/kampanya kapsamında kullanılıyor) ile (1) `children`'ı rekürsif/ağaç render'a, (2) ürün sorgusunu `categoryId in subtreeIds`'e genişletmek.

---

## E — Test sonucu

```
npm test -- --run
 Test Files  7 passed (7)
      Tests  66 passed (66)
```

66 unit testin tamamı geçti, hiçbiri bozulmadı. `scripts/db-integrity-check.ts` bir Vitest testi değil, bağımsız çalıştırılabilir bir script olarak eklendi (B bölümündeki gibi manuel/CI'da `npx tsx scripts/db-integrity-check.ts` ile çalıştırılabilir).

---

## F — Build sonucu

```
npx tsc --noEmit    → 0 hata
npm run build       → ✓ Compiled successfully, 19/19 sayfa üretildi, 0 hata/uyarı
```

---

## G — Değiştirilen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/app/kategori/[slug]/page.tsx` | `CATEGORY TREE PRODUCT AGGREGATION` TODO yorum bloğu eklendi (kod davranışı değişmedi) |
| `docs/catalog.md` | Aynı bulgu için mevcut paragraf güncellendi/genişletildi |
| `scripts/db-integrity-check.ts` | **Yeni** — salt okunur database bütünlük tarayıcısı |
| `prisma/dev.db` (gitignore'da, commit edilmez) | `BM-BAHARAT-054` ve `BM-BAHARAT-055` `Product` satırları geri yüklendi (`isActive=false`); aktif 257 ürün, kategori, marka, fiyat, stok, kampanya, banner verilerine dokunulmadı |

---

## H — Git commit

```
c6eb340 fix(data): restore FAZ1 baseline test records
 3 files changed, 126 insertions(+), 1 deletion(-)
 create mode 100644 scripts/db-integrity-check.ts
```

(`prisma/dev.db` gitignore'da olduğu için commit'e dahil değil — Product satırı geri yüklemesi yalnızca çalışan SQLite veritabanında, doğrudan Prisma `.create()` çağrılarıyla yapıldı, herhangi bir API rotası üzerinden değil.)

---

**FAZ 3'e geçilmedi.** Bu rapor onay için teslim edilmiştir.
