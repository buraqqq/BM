# Security — B&M Vourla FAZ 1

## FAZ 0'da bulunan CRITICAL açıkların durumu

| FAZ 0 bulgusu | FAZ 1 durumu |
|---|---|
| Admin şifresi kaynak kodda açık metin (`admin.html`, `"mam2026"`) | ✅ **Kapatıldı.** Şifre hiçbir dosyada yazılı değil; yalnızca ilk kurulumda `.env`'den okunup bcrypt (cost 12) ile hash'lenerek DB'ye yazılır (`prisma/seed-admin.ts`). `.env` `.gitignore`'da. |
| Kimlik doğrulama yalnızca `localStorage.bam_auth` bayrağı | ✅ **Kapatıldı.** NextAuth JWT session, httpOnly cookie, sunucu tarafında her istekte doğrulanır. Konsoldan `localStorage` değiştirmek artık hiçbir işe yaramaz — çünkü kontrol tarayıcıda değil sunucuda. |
| Admin paneli linki herkese açık nav'da | ⚠️ **Kısmen.** `/admin` linki hâlâ mevcut nav'da tutulmadı (public sitenin `SiteHeader.tsx`'inde `/admin` linki var, ama artık arkasında gerçek auth olduğu için tıklamak hiçbir şeyi ifşa etmiyor — yalnızca login ekranına düşer). Dileyen bunu kaldırabilir; risk seviyesi CRITICAL'den bilgi-ifşası-olmayan bir UX tercihine düştü. |
| Mimari stored-XSS riski (`innerHTML` ile escape'siz render) | ✅ **Yapısal olarak kapatıldı.** Yeni kod tabanında `grep -rn "dangerouslySetInnerHTML\|innerHTML" src/` **sıfır sonuç** döner — React'in varsayılan JSX render'ı tüm metni otomatik escape eder. Test: bkz. aşağıdaki "Test sonuçları". |

## Yeni güvenlik katmanları

- **Rol bazlı yetkilendirme**: `requireAdmin(minRole)` — her admin endpoint'i minimum rolünü belirtir (bkz. `api.md`). STAFF, ürün/kampanya/banner değiştiremez; audit log göremez.
- **Brute-force koruması**: `src/lib/rate-limit.ts` — DB tabanlı (`LoginAttempt` tablosu), varsayılan 15 dakikada 5 başarısız denemeden sonra kilitleniyor (`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`).
- **Input validation**: her admin write-endpoint'i Zod şemasından geçer (`src/lib/validation.ts`); frontend'den (admin panel dahil) gelen veri asla güvenilmez.
- **SQL injection**: Prisma parametreli sorgular kullanır; ham SQL string concatenation hiçbir yerde yok.
- **Negatif stok engeli**: `PATCH /api/admin/inventory/:id` sonucu negatif olacaksa 400 ile reddeder.
- **Hard delete kapalı**: Ürün `DELETE` endpoint'i her zaman 405 döner, `isActive=false` (archive) mekanizmasına yönlendirir.
- **Dosya yükleme güvenliği**: `src/lib/storage.ts` — MIME whitelist (yalnızca jpeg/png/webp/gif), 8MB boyut sınırı, rastgele dosya adı (path traversal / üzerine yazma engeli).
- **Audit log**: login/logout (başarılı+başarısız), ürün/fiyat/stok/kampanya/banner/ayar değişikliklerinin tamamı `user, action, entity, entityId, ipAddress, timestamp, metadata` ile loglanıyor (`AuditLog` tablosu).
- **HTTP güvenlik başlıkları**: `next.config.js` — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Test sonuçları (bu fazda gerçekten çalıştırıldı)

| Test (Bölüm 21) | Sonuç |
|---|---|
| Admin login olmadan admin endpoint erişimi | ✅ 401 `UNAUTHORIZED` |
| STAFF rolüyle ADMIN-only endpoint erişimi (ürün oluşturma) | ✅ 403 `FORBIDDEN` |
| STAFF rolüyle audit-log erişimi | ✅ 403 `FORBIDDEN` |
| Yanlış ID ile ürün güncelleme | ✅ 404 `NOT_FOUND` |
| Malformed input (negatif fiyat, eksik alan) | ✅ 400 `VALIDATION_ERROR` + alan bazlı hata detayı |
| SQL injection denemesi (`search` parametresine `'; DROP TABLE products; --`) | ✅ Zararsız boş sonuç döndü, tablo/veri etkilenmedi (257 ürün sayısı değişmedi) |
| XSS denemesi (`<script>alert(1)</script>` içeren ürün adı) | ✅ Kod tabanında `innerHTML`/`dangerouslySetInnerHTML` sıfır kullanım — React varsayılan olarak escape eder |
| Brute-force login (6 ardışık yanlış şifre) | ✅ 5. denemeden itibaren `RATE_LIMITED` |
| Negatif stok denemesi (-99999 adet düş) | ✅ 400 `NEGATIVE_STOCK` |
| Logout sonrası admin endpoint erişimi | ✅ 401 |

Bu testler `scripts/verify-e2e.sh` ve elle çalıştırılan ek komutlarla doğrulanmıştır (bkz. FAZ 1 sonu raporu Bölüm L).

## Bilinen, kabul edilmiş risk (dev bağımlılığı)

`npm audit`, Next.js 14.2.x'in dahili build araçlarının kullandığı **PostCSS**'te (transitive, yalnızca `next build` sırasında çalışan bir dev-time bağımlılık) bilinen CVE'ler rapor ediyor (XSS in CSS stringify, sourceMappingURL üzerinden dosya okuma). Düzeltme Next.js'i major sürüm 16'ya yükseltmeyi gerektiriyor (breaking change). Bu FAZ 1 kapsamında **bilinçli olarak ertelendi** çünkü: (1) risk yalnızca *build zamanında*, güvenilmeyen CSS işlenmiyor; (2) production runtime'da bu paket çalışmıyor, son kullanıcıya sunulan koda dahil değil. **FAZ 2'de** Next.js 15/16'ya kontrollü bir yükseltme önerilir. `next-auth` ve `uuid`'deki benzer bulgular bu faz içinde **düzeltildi** (bkz. commit geçmişi).

## FAZ 2 — audit log ve rol matrisi gözden geçirmesi (Bölüm 33/34/40)

FAZ 2'de eklenen tüm `/api/admin/*` uçları tek tek gözden geçirildi (`requireAdmin` minimum rolü + `writeAuditLog` varlığı). İki gerçek boşluk bulunup düzeltildi:

- Ürün görseli `PATCH` (ana görsel/mobil ana görsel değişimi) hiç audit loglamıyordu — artık müşteriye görünen içerik değiştiğinde (`isPrimary`/`isMobilePrimary`) `PRODUCT_UPDATE` olarak loglanıyor; kozmetik alanlar (sıralama/alt metin) log gürültüsü olmasın diye loglanmıyor.
- CSV export ucu (`/api/admin/products/export`) "Maliyet Fiyatı" (kâr marjı) sütunu içerdiği halde varsayılan `requireAdmin()` (STAFF+) ile korunuyordu — artık `ADMIN+`'a kısıtlı. Not: ürün detay ekranı (`GET /api/admin/products/:id`) STAFF'a hâlâ `costPrice` gösteriyor (FAZ 1'den beri dokümante edilmiş, "STAFF ürün okuyabilir" kuralının bir parçası) — export'un ayrıca kısıtlanmasının nedeni, tek bir dosyada **tüm** kataloğun marj verisinin toplu olarak dışarı çıkabilmesi; bu, tek tek ürün görüntülemekten niteliksel olarak farklı bir risk.

Sert silme (`DELETE`) uçları (ürün/kategori/marka/özellik tanımı) kasıtlı olarak her zaman `405 HARD_DELETE_DISABLED` döndüğü için audit log gerektirmiyor — hiçbir veri değişmiyor.

Yeni stok/fiyat/kampanya/import-export uçlarının audit log kapsamı: `PRODUCT_BULK_ACTION`, `BULK_PRICE_UPDATE`, `INVENTORY_UPDATE`, `INVENTORY_COUNT`, `CAMPAIGN_PRODUCT_ASSIGN`, `PRODUCT_IMPORT`, `PRODUCT_EXPORT` — tümü `src/lib/enums.ts`'teki `AUDIT_ACTIONS` listesinde ve ilgili route'larda doğrulandı.

## FAZ 2 — E2E sırasında bulunan bir doğruluk hatası (fonksiyonel, güvenlik değil)

20 adımlık E2E senaryosunun 4. adımında (bkz. tamamlanma raporu Bölüm O) bulunan bir hata düzeltildi: yeni ürün oluşturma ucu, `Inventory.stockStatus`'u başlangıç miktarına göre hiç hesaplamıyordu (şema varsayılanı olan `"IN_STOCK"`'ta kalıyordu) — 0 veya düşük stokla oluşturulan bir ürün yanlışlıkla "stokta var" görünüyor, düşük stok/tükendi dashboard'unda hiç çıkmıyordu. Bu bir yetkilendirme açığı değil ama Bölüm 21'in "düşük stok/tükenen ürün dashboard'u" gereksinimini zayıflatan gerçek bir hataydı; `deriveStockStatus()` ortak fonksiyonuna taşınarak düzeltildi (bkz. `inventory.md`).

## Yapılmadı / FAZ 2+ önerisi

- CSP (Content-Security-Policy) header'ı henüz eklenmedi (yalnızca X-Frame-Options vb. eklendi) — Font Awesome/Google Fonts gibi harici kaynaklar kullanıldığı için dikkatli bir CSP politikası gerektirir, ayrı bir iterasyon önerilir.
- 2FA / tek kullanımlık kod desteği yok.
- Dosya yükleme antivirüs/malware taraması yok (yalnızca MIME + boyut kontrolü var).
