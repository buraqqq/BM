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

## FAZ 4A — Müşteri hesabı, IDOR savunması, oturum ayrımı

- **İki oturum türü, tek NextAuth**: `session.user.kind: "admin" | "customer"` (bkz. `src/lib/auth.ts`). `requireAdmin()` artık `kind !== "admin"` ise de reddediyor (önceden yalnızca `role` listesine bakıyordu — customer'da `role` zaten `undefined` olduğu için fail-closed davranış vardı, ama niyeti netleştirmek için açık kontrol eklendi). `requireCustomer()` (`src/lib/require-customer.ts`) aynı deseni customer için uyguluyor. Bir admin oturumuyla `/api/account/*`/`/api/cart/*`'a, ya da bir customer oturumuyla `/api/admin/*`'a erişim denemesi **her ikisi de** `scripts/faz4a-commerce-e2e-check.ts` ve manuel curl ile test edildi — hiçbiri diğerinin ucuna erişemiyor.
- **IDOR savunması — "var/yok" ile "başkasına ait" ayrımı sızdırılmaz**: `Address` ve `CartItem` sahiplik kontrolleri (bkz. `docs/commerce.md` "Address ownership") her zaman `404 NOT_FOUND` döner, `403 FORBIDDEN` DEĞİL — bir saldırgan, denediği id'nin var olup olmadığını bile öğrenemez. Gerçek ikinci bir kullanıcı ile GET/PATCH/DELETE denemeleri `scripts/faz4a-commerce-e2e-check.ts`'te otomatik test edildi (bkz. Test 11/23) — tüm denemeler 404 ile reddedildi, hedef kayıt hiçbir şekilde değişmedi.
- **Müşteri login — genel hata mesajı**: admin akışıyla AYNI ilke (`NextAuth authorize() → null` = tek tip "CredentialsSignin" hatası) — "bu e-posta kayıtlı mı" bilgisi login'de sızdırılmaz. Kayıt (register) ucunda ise (farklı tehdit modeli — kullanıcı kendi kaydını tamamlayabilmeli) `409 EMAIL_TAKEN` açıkça döner; bu bilinçli bir asimetri, iki farklı gereksinim (login'de keşif engelleme vs. kayıtta kullanılabilir UX) arasındaki standart e-ticaret dengesidir.
- **Brute-force koruması customer'a da genişletildi**: mevcut `LoginAttempt` tablosu + `isLoginRateLimited`/`recordLoginAttempt` (Bölüm 21'den beri var) müşteri girişleri için de AYNI şekilde çalışıyor — yeni bir tablo/servis eklenmedi.
- **Şifre güvenliği**: bcrypt cost 12 (admin ile aynı), düz metin hiçbir yerde tutulmuyor/loglanmıyor. Şifre değiştirme mevcut şifreyi `bcrypt.compare` ile doğruluyor. **Bilinen sınır**: şifre değiştirildiğinde MEVCUT oturum (varsa açık kalan diğer cihazlar) anında iptal edilmiyor — JWT stratejisi (session store'suz) doğası gereği, oturum kendi doğal süresinde (8 saat) sona eriyor. Gerçek bir session-invalidation mekanizması (DB tabanlı session listesi) bu fazda bilinçli olarak eklenmedi (over-engineering, gereksinimde de istenmedi).
- **Guest cart cookie**: `bm_guest_cart`, HttpOnly + `secure` (production'da) + `SameSite=Lax` — JavaScript'ten okunamaz, CSRF yüzeyini SameSite ile daraltır. Cookie yalnızca bir DB satırına referans taşır, sepet içeriği asla cookie/localStorage'da tutulmaz.
- **Yeni admin write-endpoint'i eklenmedi** — FAZ4A tamamen public/customer API yüzeyi (`/api/account/*`, `/api/cart/*`); admin panelinin güvenlik yüzeyi bu fazda değişmedi.

## FAZ 4B — Checkout yetkilendirme, client price manipülasyonu, teslimat/adres/toplam tahrifatı

- **Checkout authorization**: `POST /api/checkout/validate`, `requireCustomer()` (FAZ4A'dan AYNEN yeniden kullanıldı) ile başlıyor — oturumsuz istek `401 UNAUTHORIZED`, bir admin oturumuyla da erişilemiyor (`kind !== "customer"`). Guest checkout bu fazda YOK — bu bilinçli bir tasarım kararı (Bölüm 3), teknik bir eksiklik değil.
- **Client price manipulation (fiyat/toplam tahrifatı)**: `checkoutValidateSchema` (`src/lib/customer-validation.ts`) yalnızca `addressId`/`deliveryMethod` alanlarını TANIMLAR — `price`/`subtotal`/`total`/`shippingPrice`/`quantity` şemada YOK. zod'un varsayılan "strip" davranışı gereği istemcinin gönderdiği bu alanlar route.ts'e **hiçbir zaman ulaşmaz**; sunucu subtotal/shipping/total'ı HER ZAMAN kendi `computeFinalPrice()`+`computeCheckoutTotals()` zincirinden yeniden hesaplar. `scripts/faz4b-checkout-e2e-check.ts`, gerçek bir HTTP isteğinde `price:1, subtotal:1, total:1, shippingPrice:999999, quantity:999` gönderip sunucunun GERÇEK değerleri döndürdüğünü doğruladı (13. adım — 4 ayrı assertion).
- **Address IDOR (checkout'ta da aynı desen)**: `findOwnedAddress()` FAZ4A'da `/api/account/addresses/[id]/route.ts` içinde private tanımlıydı; FAZ4B'de checkout'un da AYNI kontrole ihtiyaç duyması üzerine `src/lib/address-ownership.ts`'e taşınarak PAYLAŞILAN, iş mantığını ikinci kez yazmayan tek bir fonksiyona dönüştürüldü — her iki route da bunu import ediyor. "Var/yok" ile "başkasına ait" ayrımı burada da sızdırılmıyor: her iki durum da AYNI `{valid:false, errors:[{code:"ADDRESS_NOT_FOUND"}]}` (422) döner. Gerçek ikinci bir kullanıcı ile IDOR denemesi `scripts/faz4b-checkout-e2e-check.ts`'te (17. adım) doğrulandı — A'nın adresi B'nin denemesinden etkilenmedi.
- **Delivery method tampering (teslimat yöntemi tahrifatı)**: `deliveryMethod`, `DELIVERY_METHODS` (`src/lib/enums.ts`, tek kaynak) üzerinden zod `.enum()` ile doğrulanıyor — `"HACK"` gibi keyfi bir değer `400/422 VALIDATION_ERROR` ile reddediliyor, hiçbir zaman "en yakın geçerli değere" sessizce düşürülmüyor. `DELIVERY` seçiliyken `addressId` eksikse de aynı şekilde (zod `superRefine`) reddediliyor.
- **Total tampering / stok-fiyat-aktiflik sessizce yok sayılmama**: checkout, `deriveCheckoutIssues()` ile satıştan kalkmış (`PRODUCT_INACTIVE`) veya stoğu aşan (`STOCK_INSUFFICIENT`) ürün varken **BLOKE OLUR** (`valid:false`) — kullanıcı bu durumları görmeden "geçerli" bir toplam alamaz. Fiyat değişikliği bloke etmez ama `warnings` alanında AÇIKÇA gösterilir; toplam asla eski (bayat) fiyattan sessizce hesaplanmaz.
- **Sıfır side-effect garantisi**: checkout doğrulaması `Order`/`Payment`/`InventoryMovement` gibi HİÇBİR yeni satır yaratmaz — bu fazda `Order` modeli Prisma şemasında yok, `scripts/faz4b-checkout-e2e-check.ts` bunu doğrudan kontrol ediyor (21. adım) ve stok-yetersizliği senaryosunda `InventoryMovement` sayısının değişmediğini de ayrıca doğruluyor (15. adım).

## Yapılmadı / FAZ 2+ önerisi

- CSP (Content-Security-Policy) header'ı henüz eklenmedi (yalnızca X-Frame-Options vb. eklendi) — Font Awesome/Google Fonts gibi harici kaynaklar kullanıldığı için dikkatli bir CSP politikası gerektirir, ayrı bir iterasyon önerilir.
- 2FA / tek kullanımlık kod desteği yok.
- Dosya yükleme antivirüs/malware taraması yok (yalnızca MIME + boyut kontrolü var).

---

# Sipariş güvenliği — FAZ 4C

## Order IDOR

Müşteri sipariş detayı `GET /api/orders/[orderNumber]`, `order.userId ===
session.user.id` kontrolüyle korunur. **Var olmayan** ve **başkasına ait** sipariş
AYNI 404 `ORDER_NOT_FOUND` döner — "bu sipariş var ama sana ait değil" bilgisi
dışarı sızdırılmaz (FAZ 4A `findOwnedAddress` / FAZ 4B checkout deseninin order
karşılığı). Müşteri listesi (`GET /api/orders`) zaten yalnızca `userId` filtresiyle
sorgulanır.

## Client fiyat/toplam/quantity manipülasyonu

`POST /api/orders` gövdesi yalnızca `addressId` + `deliveryMethod` içerir
(`checkoutValidateSchema`, FAZ 4B'den aynen). `price` / `subtotal` / `total` /
`shippingPrice` / `quantity` şemada **tanımlı değildir** — zod bunları sessizce
eler; sunucu tüm parasal değerleri `computeFinalPrice` + `computeCheckoutTotals`
ile kendi hesaplar. İstemcinin gönderdiği hiçbir parasal değer source of truth
değildir.

## Duplicate submit koruması

Sipariş, sepeti `ACTIVE → CONVERTED`'a çeken **atomik** `updateMany` ile korunur;
`Order.cartId` `@unique`'dir. Bu ikili, hem ardışık hem eşzamanlı çift-submit'te
tek sipariş garantiler. İkinci istek `409 ORDER_ALREADY_CREATED` (mevcut sipariş
numarasıyla) veya `422 EMPTY_CART` alır.

## Transaction atomicity

Order oluşturma tek `prisma.$transaction` içindedir: sepet claim + stok düşme +
InventoryMovement + Order + OrderItem + AddressSnapshot + StatusHistory **ya hepsi
ya hiçbiri**. Herhangi bir adım başarısız olursa (örn. yetersiz stok → `count=0`)
transaction geri alınır — yarım Order/OrderItem/Inventory durumu kalmaz.

## Inventory race condition / SQLite sınırları

- Stok, `updateMany({ where: { quantity: { gte: X } }, data: { decrement: X } })`
  ile **koşullu tek SQL ifadesi** olarak düşülür. `WHERE quantity >= X` guard'ı
  SQL düzeyinde atomiktir; eşzamanlı isteklerde bile negatif stoğa düşmek
  imkânsızdır.
- **Bilinçli sınır**: SQLite tek-yazıcı (single-writer) modeli kullanır ve tüm
  veritabanını kilitler; dağıtık/multi-master concurrency garanti etmez. Bu
  ölçekte (küçük işletme, tek süreç) koşullu UPDATE yeterince güçlüdür, ancak
  çok-düğümlü bir dağıtıma geçilirse Postgres'e geçiş + satır-kilidi (row lock)
  veya ayrı bir stok rezervasyon servisi gerekir. Bu, gizlenmez.

## Admin sipariş yönetimi

- Admin order uçları `requireAdmin(["ADMIN", "SUPER_ADMIN"])` gerektirir (müşteri
  PII içerdiği için STAFF hariç — audit-log ile aynı hassasiyet).
- Durum geçişleri `order-logic.ts` transition kurallarıyla **server-side**
  doğrulanır; geçersiz geçiş 422 `INVALID_TRANSITION`.
- Durum/ödeme durumu değişiklikleri `writeAuditLog` ile (`ORDER_STATUS_UPDATE`,
  `ORDER_PAYMENT_STATUS_UPDATE`) kaydedilir; manuel ödeme durumu değişimi de
  audit'e tabidir.
