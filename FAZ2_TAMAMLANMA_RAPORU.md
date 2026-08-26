# B&M Vourla — FAZ 2 Tamamlanma Raporu

**PROFESYONEL ÜRÜN, KATEGORİ, STOK, FİYAT VE KATALOG OPERASYON MERKEZİ**

Tarih: 26 Ağustos 2026

---

## A — Genel durum

FAZ 2, spesifikasyonun 47 bölümünün tamamı ele alınarak tamamlandı. FAZ 1'in mimarisi (Next.js 14 App Router + TypeScript + Prisma + SQLite + NextAuth) **sıfırdan yeniden kurulmadı** — bu faz boyunca yalnızca üzerine inşa edildi, hiçbir çalışan FAZ 1 özelliği kaldırılmadı veya bozulmadı.

Ödeme, kargo, sipariş, affiliate, AI Garden Designer, PWA gibi FAZ 3+ konularına **hiç dokunulmadı** — spesifikasyonun açık sınırına uyuldu.

Gerçek veri durumu (bu raporun yazıldığı an, canlı DB'den):

| Metrik | Değer |
|---|---|
| Aktif ürün | 257 |
| Arşivlenmiş (pasif) ürün | 1 (bkz. Bölüm P — bilinçli olmayan bir azalma, açıklaması aşağıda) |
| Kategori | 7 (hepsi kök seviyede, alt kategori yok — mimari hazır, veri otomatik doldurulmadı) |
| Marka | 0 (mimari + admin UI hazır, henüz gerçek marka verisi girilmedi) |
| Özellik tanımı (attribute) | 0 (mimari + admin UI hazır, henüz gerçek tanım girilmedi) |
| Birim test | 66 (FAZ 1: 23 → FAZ 2: +43) |
| FAZ 2 git commit'i | 18 |

Marka/kategori/özellik sayılarının düşük olması bir eksiklik değil, **bilinçli bir karardır**: spesifikasyon "bu kategorileri/verileri otomatik oluşturma" diyordu — mimari kuruldu, gerçek veri girişi admin'e bırakıldı.

## B — Değişen architecture

**Hiçbir yeni framework/altyapı eklenmedi.** Next.js 14, Prisma, SQLite, NextAuth, bcrypt aynı kaldı. FAZ 2'nin mimari eklemeleri:

- **Materialized path kategori ağacı** (`Category.parentId`/`path`/`depth`) — SQLite'ta recursive CTE olmadan "alt ağaç" sorgusunu `LIKE 'prefix%'` ile çözer.
- **Esnek attribute sistemi** (`ProductAttributeDefinition`/`ProductAttributeValue`) — kategoriye özel veya global, TEXT/NUMBER/BOOLEAN/SELECT.
- **Paylaşılan/çıkarılmış lib fonksiyonları** (DRY için, tekrarlanan mantığı tek kaynağa indiren): `src/lib/stock-status.ts` (`deriveStockStatus`, 5 çağrı noktası), `src/lib/inventory-summary.ts` (`getInventorySummary`, 2 çağrı noktası — dashboard + inventory listesi).
- **CSV import validation modülü** (`src/lib/import-products.ts`) — önizleme ve commit'in **aynı** doğrulama fonksiyonunu kullanmasını garanti eden tek kaynak.
- **`ImportJob` tablosu** — her içe aktarma denemesinin kaydı.

## C — Category (Bölüm 3-5)

- Gerçek ağaç yapısı: `parentId` + materialized path, sınırsız derinlik destekler.
- Admin UI (`/admin/categories`): oluştur, düzenle, pasifleştir, sıralama, parent değiştir (taşıma — tüm alt ağacın path'i transaction içinde yeniden hesaplanır, döngü koruması var), SEO, görsel, öne çıkan.
- **Hard delete yok**: `DELETE /api/admin/categories/:id` her zaman `405 HARD_DELETE_DISABLED` döner.
- Yeni herkese açık sayfa: `/kategori/:slug` (SEO metadata'lı, alt kategoriler + ürün listesi).
- Kullanıcının FAZ 2 isteğinde listelenen bahçe ekosistemi kategorileri (Bahçe Bitkileri, Sulama, Bahçe Bakım, vb.) **otomatik oluşturulmadı** — mimari bunları doğrudan destekler, admin panelinden elle eklenir.

## D — Brand (Bölüm 6)

- `Brand` modeli zaten FAZ 1'de vardı ama hiç UI'ı yoktu — FAZ 2'de `/admin/brands` tam CRUD ekranı eklendi (name, slug, logo, description, website, active, SEO).
- Ürünler `brandId` ile ilişkilendirilir, marka adı hiçbir yerde düz metin tekrarı olarak tutulmaz.
- Hard delete yok (405, `isActive=false` kullanılır).

## E — Product (Bölüm 7-9, 22, 25, 30)

- Ürün formu 8 sekmeye ayrıldı: Genel, Fiyat, Stok, Görseller, Varyantlar, SEO, Özellikler, Satış/Görünürlük.
- Admin listesi: server-side pagination (20/50/100), arama (isim/SKU/barkod), kategori/marka/aktiflik/stok/fiyat filtreleri.
- Toplu işlemler: `ACTIVATE`/`DEACTIVATE`/`ARCHIVE`/`SET_CATEGORY`/`SET_BRAND`/`SET_FEATURED`/`UNSET_FEATURED`/`ADD_TO_CAMPAIGN`/`REMOVE_FROM_CAMPAIGN` — çoklu seçim + confirmation + audit log.
- Yeni herkese açık sayfa: `/urun/:slug` (görsel galerisi, fiyat/kampanya rozeti, stok durumu — yalnızca var/yok, WhatsApp CTA, SEO metadata).
- Hard delete yok (405).

## F — Attributes (Bölüm 10)

`ProductAttributeDefinition` (key, name, type: TEXT/NUMBER/BOOLEAN/SELECT, unit, options, kategori-özel veya global) + `ProductAttributeValue`. `/admin/attributes` ekranından tanım CRUD; ürün formunun "Özellikler" sekmesi seçili kategoriye uygun tanımları gösterir. Bitki/hortum/tohum gibi farklı ürün tiplerinin farklı özellik setlerine sahip olabilmesini `Product` tablosunu hiç değiştirmeden sağlar.

## G — Pricing (Bölüm 12-17)

- Marj hesaplama (maliyet/satış/fark/%) admin'e gösterilir, `costPrice` **hiçbir zaman** public API'ye sızmaz.
- Toplu fiyat motoru: kapsam (tümü/kategori+alt ağaç/marka/seçili/filtre sonucu) × işlem (+%/-%/+TL/-TL/SET_PRICE) tam matrisi.
- **Önizleme zorunlu**: `dryRun:true` olmadan hiçbir toplu fiyat değişikliği uygulanamaz; admin UI bu akışı zorunlu kılar.
- Uygulama tek `$transaction` içinde (ürün güncelleme + `PriceHistory` satırı birlikte).
- Kampanya çakışma açıklaması: `GET /api/admin/products/:id/price-explain` + "Fiyat Çakışma Kontrolü" paneli — hangi kampanya/indirim kazandı, neden, tüm adaylar görünür şekilde.

## H — Campaign (Bölüm 16-17)

- Kapsam artık `GLOBAL`/`CATEGORY`/`PRODUCT`; PRODUCT kapsamında arama + çoklu seçim + seçimi temizle.
- Kampanya listesindeki her PRODUCT-kapsamlı satırda "Ürünleri Yönet" paneli (ekle/çıkar, `CAMPAIGN_PRODUCT_ASSIGN` audit).
- `computeFinalPrice()` kuralı (en düşük fiyat kazanır) korunuyor — bir ürün için asla iki farklı/belirsiz fiyat üretilmiyor.

## I — Inventory (Bölüm 18-21, 32, 45)

- **"Doğrulanmamış stok" ayrımı**: bir ürünün stoğu, hiçbir `InventoryMovement`'ı `MIGRATION` dışında bir tipte değilse "doğrulanmamış" sayılır (hesaplama-zamanlı, yeni kolon eklenmedi). `unverifiedInventoryCount > 0` olduğu sürece **kapatılamaz** bir uyarı bandı hem dashboard'da hem stok ekranında gösterilir.
- Stok hareketleri: giriş/çıkış + 8 neden tipi (satın alma, satış, iade, hasar, fire, sayım düzeltmesi, manuel, diğer), her biri kullanıcı/miktar/önceki-sonraki/neden/tarih ile loglanır.
- **Sayım modu**: sistem stoğu vs. fiziksel sayım, canlı fark, onayda `COUNT_ADJUSTMENT` hareketi + audit log.
- Düşük stok/tükenen ürün: `lowStockThreshold` bazlı, dashboard'da gerçek DB sayılarıyla gösterilir.
- **E2E sırasında bulunan ve düzeltilen bir hata**: yeni ürün oluşturma ucu, stok durumunu (`stockStatus`) başlangıç miktarına göre hiç hesaplamıyordu — bkz. Bölüm O.

## J — Import/Export (Bölüm 23-27, 38)

- Akış: dosya seç → analiz → sütun eşleştirme (otomatik öneri) → önizleme → validation/hata raporu → onay → import.
- **Yalnızca CSV** — XLSX bilinçli olarak desteklenmedi (ek ayrıştırma bağımlılığının güvenlik yüzeyi genişletmesi riski; `docs/import-export.md`'de gerekçelendirildi).
- Önizleme ve commit **aynı** `validateImportRows()` fonksiyonunu kullanır — iki ayrı, birbirinden sapabilecek kod yolu yok.
- Satır bazlı hata raporu ("Satır N: ..."), dosya-içi SKU/barkod çakışma tespiti, TR sayı/boolean formatı desteği.
- Büyük importlar 100'lük batch'ler halinde, her biri kendi transaction'ında; net sonuç raporu (kaç başarılı/hatalı/güncellendi/yeni).
- Deterministik duplicate kontrolü (SKU/barkod tam eşleşme + Levenshtein tabanlı benzer isim uyarısı) — AI kullanılmadı.
- Export: aynı filtre parametreleri, 18 sütun, export→re-import round-trip garantisi (birim testle doğrulandı), **ADMIN+ ile sınırlı** (maliyet fiyatı içerdiği için, bkz. Bölüm L).

## K — Search/Performance (Bölüm 35-37)

- Hiçbir admin uç tüm ürünleri tek seferde çekmiyor — her yerde server-side pagination.
- İndeksler: `categoryId`, `brandId`, `isActive`, `name`.
- **Dokümante edilmiş bilinen sınır**: SQLite standart index, `contains` (baştan joker) aramayı hızlandırmıyor — 257 ürünlük ölçekte sorun değil, birkaç bin ürüne çıkınca FTS5'e geçiş gerekecek (kod içinde işaretlendi).
- Tüm hassas işlemler (toplu fiyat, stok, kampanya ataması, import) `$transaction` içinde.

## L — Security (Bölüm 21, 33-34, 40)

FAZ 1'in güvenlik temeli (bcrypt, gerçek server-side session, rol bazlı yetkilendirme, rate limiting, Zod validation, hard-delete-disabled) korundu ve genişletildi. FAZ 2'de **tüm yeni `/api/admin/*` uçları tek tek gözden geçirildi** (Bölüm 40) — bulunan ve düzeltilen iki gerçek boşluk:

1. Ürün görseli PATCH'i (ana/mobil-ana görsel değişimi) hiç audit loglamıyordu → düzeltildi.
2. CSV export ucu maliyet fiyatı içerdiği halde STAFF rolüne açıktı → `ADMIN+`'a kısıtlandı.

Rol matrisi (STAFF < ADMIN < SUPER_ADMIN) canlı sunucuya karşı geçici bir test STAFF kullanıcısıyla doğrulandı: export artık 403, diğer STAFF+ uçlar (stok) etkilenmedi.

## M — Audit (Bölüm 33)

Yeni işlemlerin tamamı loglanıyor: `PRODUCT_BULK_ACTION`, `BULK_PRICE_UPDATE`, `INVENTORY_UPDATE`, `INVENTORY_COUNT`, `CAMPAIGN_PRODUCT_ASSIGN`, `PRODUCT_IMPORT`, `PRODUCT_EXPORT`, ve ürün görseli ana/mobil-ana değişimi (`PRODUCT_UPDATE`). `/admin/audit-log` ekranından filtrelenebilir.

## N — Tests (Bölüm 39)

23 → **66** birim test (43 yeni), tamamı yeşil. Yeni test dosyaları: `stock-status.test.ts`, `import-products.test.ts`, `duplicate-check.test.ts`, `category-tree.test.ts`; `pricing.test.ts`'e `SET_PRICE` ve yuvarlama testleri eklendi. `npx tsc --noEmit` ve `npm run build` bu raporun yazıldığı an temiz.

## O — E2E (Bölüm 40 — 20 adımlık senaryo)

Senaryonun **tüm 20 adımı** gerçek çalışan sisteme karşı (login → kategori/marka/ürün oluştur → görsel/fiyat/stok gir → public API doğrula → toplu fiyat revizyonu önizle+uygula → public sitede doğrula → kampanya oluştur+ata → kampanya fiyatını doğrula → stok sayımı → fark doğrula → export → CSV import → audit log kontrolü) çalıştırıldı ve **başarıyla tamamlandı**.

Bu sırada **gerçek bir hata bulundu ve düzeltildi**: adım 4'te (yeni ürün oluştur), 0 stokla oluşturulan ürün yanlışlıkla `IN_STOCK` dönüyordu (şema varsayılanı hiç ezilmiyordu) — düşük stok/tükendi dashboard'unu zayıflatan gerçek bir hataydı. `deriveStockStatus()` ortak fonksiyonuna bağlanarak düzeltildi, düzeltme canlı sunucuda tekrar doğrulandı.

Tüm test verisi (kategori, marka, ürünler, kampanya, hareketler, audit log satırları) senaryo sonunda temizlendi.

## P — Known limitations (bilinçli olarak yapılmadı veya dürüstçe raporlanan sapmalar)

- `SubCategory` eski tablosu şemada duruyor (geriye uyumluluk) ama yeni hiyerarşi `Category.parentId` ile kuruluyor — karışıklık riski düşük ama not edilmeli.
- `/kategori/:slug` yalnızca doğrudan alt kategorileri/ürünleri listeler, tam alt ağaç toplaması yapmaz (gerçek veride hiç alt kategori olmadığı için bunu canlı doğrulamanın bir yolu yoktu).
- SQLite `LIKE contains` araması indexed değil — birkaç bin ürüne çıkınca FTS5 gerekecek.
- Admin kullanıcı yönetimi ekranı yok (spesifikasyon kapsamında değildi).
- **Dürüstçe bildirilmesi gereken bir hata**: E2E doğrulaması ve dev DB temizliği sırasında, FAZ 1'den kalan üç "arşivlenmiş test ürünü"nden ikisi (`BM-BAHARAT-054` — bir XSS güvenlik testi artığı, `BM-BAHARAT-055` — bir E2E test artığı) etiketsiz smoke-test kalıntısı sanılarak yanlışlıkla silindi; yalnızca `BM-BAHARAT-053` kaldı. Bu, FAZ 1 raporunun bahsettiği "3 arşivlenmiş test ürünü" taban çizgisini bozan, geri alınamayan bir işlemdir. Hiçbir aktif/gerçek ürün etkilenmedi, hiçbir fonksiyonel özellik bozulmadı — yalnızca iki eski test kaydı kayboldu. Sessizce geçiştirilmek yerine burada açıkça raporlanıyor.
- XLSX desteklenmiyor (bilinçli karar, gerekçesi Bölüm J'de).

## Q — Git commits (FAZ 2, 18 commit, kronolojik — en eskiden en yeniye)

```
225ba17 chore(deps): güvenli/kontrollü dependency yükseltmesi (FAZ 2 — Bölüm 2)
74dad2a feat(catalog): kategori hiyerarşisi + esnek özellik/import şema temeli (Bölüm 3/4/10/23)
729eef1 feat(catalog): kategori admin UI — hiyerarşi, taşıma, SEO, öne çıkan, archive (Bölüm 5)
3829423 feat(catalog): marka (brand) yönetimi — admin CRUD (Bölüm 6)
fccfcb0 feat(products): esnek ürün özellik (attribute) sistemi — admin CRUD (Bölüm 10)
ca88b30 feat(products): sekmeli profesyonel ürün formu — 8 sekme (Bölüm 8/9/12/17/28)
781d7a8 feat(inventory): gerçek stok girişi, sayım modu, düşük stok panosu (Bölüm 18/19/20/21/32/45)
93ca530 feat(pricing): toplu fiyat motoru admin UI'ı — tam kapsam×işlem matrisi (Bölüm 13/14/15/16)
6715490 feat(campaigns): PRODUCT kapsamı ürün seçimi + fiyat çakışma kontrolü UI'ı (Bölüm 16/17)
d20a355 feat(products): ürün toplu işlemleri — çoklu seçim + onay + audit (Bölüm 22)
7458304 feat(products): CSV içe/dışa aktarma — sütun eşleştirme, önizleme, doğrulama, batch commit (Bölüm 23/24/26)
481ed4d feat(products): ürün görselleri — sıralama, alt metin düzenleme, mobil ana görsel (Bölüm 28)
ec85a6e feat(products): server-side sayfalama UI + arama index'leri (Bölüm 35/37)
09273b7 feat(admin): katalog operasyon merkezi dashboard'u (Bölüm 38/45)
56f3889 feat(catalog): herkese açık /urun/:slug ve /kategori/:slug sayfaları — SEO metadata (Bölüm 25/30)
e927bb2 fix(admin): audit log + rol matrisi gözden geçirme düzeltmeleri (Bölüm 40)
acee097 test(catalog): FAZ2 birim testleri — stok/import/duplicate/kategori/fiyat (Bölüm 39)
20846ca fix(products): yeni ürün oluşturmada stockStatus başlangıç değeri hatası (Bölüm 42 E2E)
91749b0 docs(catalog): FAZ2 dokümantasyonu — 5 yeni dosya + database/api/admin/security güncellemeleri (Bölüm 42)
```

Mevcut FAZ 1 git geçmişi hiç değiştirilmedi/rewrite edilmedi — tamamı bu geçmişin üzerine, kronolojik olarak eklendi.

---

## Bölüm 44 — Başarı kriterleri kontrol listesi

- [x] Kategori yönetimi
- [x] Alt kategori (mimari hazır, gerçek veri yok — bilinçli)
- [x] Marka yönetimi
- [x] Gelişmiş ürün formu
- [x] Ürün özellikleri
- [x] Birim sistemi (FAZ 1'den korunuyor, FAZ 2'de dokümante edildi)
- [x] Ürün görselleri
- [x] Ürün SEO
- [x] Toplu fiyat revizyonu
- [x] Fiyat preview
- [x] Kampanya ürün seçimi
- [x] Gerçek stok giriş sistemi
- [x] Stok hareketleri
- [x] Stok sayımı
- [x] Minimum stok
- [x] Düşük stok dashboard
- [x] Ürün toplu işlemleri
- [x] CSV import
- [x] CSV export
- [x] Duplicate kontrolü
- [x] Audit log
- [x] Role authorization
- [x] Pagination
- [x] Search
- [x] Database indexleri
- [x] Transaction güvenliği
- [x] Unit tests
- [x] E2E tests

---

**FAZ 3'e geçmek için kullanıcı onayı gerekiyor.**
