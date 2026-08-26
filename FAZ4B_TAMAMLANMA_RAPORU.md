# B&M VOURLA — FAZ 4B TAMAMLANMA RAPORU
## Checkout Foundation + Delivery Selection

Tarih: 2026-08-26

---

## A — Checkout Architecture

Tek yeni API ucu: `POST /api/checkout/validate`. Bu uç **hiçbir DB satırı yaratmaz/değiştirmez** — mevcut Cart/Address/Product/Inventory verisini okur, sunucu tarafında yeniden hesaplar, yapılandırılmış bir önizleme döner. Order/Payment/Shipping modeli oluşturulmadı.

Mimari, projenin kurulu "pure logic in lib, DB I/O in route" desenini birebir izliyor: `src/lib/checkout-logic.ts` (DB'siz, saf fonksiyonlar — `isValidDeliveryMethod`, `buildAddressSnapshot`, `calculateShippingPrice`, `computeCheckoutTotals`, `deriveCheckoutIssues`, `assembleCheckoutResponse`) + `src/app/api/checkout/validate/route.ts` (ince DB-orkestrasyon katmanı). Response şekli tek bir yerde (`assembleCheckoutResponse`) üretiliyor — `{valid:true, cart, delivery, pricing, warnings}` ya da `{valid:false, errors}`.

Hiçbir mevcut sistem yeniden yazılmadı: pricing engine, Cart/CartItem şeması, authentication, address CRUD hepsi olduğu gibi yeniden kullanıldı.

## B — Authentication

Checkout yalnızca `requireCustomer()` (FAZ4A'dan aynen) ile korunuyor — oturumsuz istek `401`, admin oturumuyla da erişilemiyor. Guest checkout bilinçli olarak bu fazda yok (Bölüm 3): guest `/checkout`'a geldiğinde sepeti/cookie'si dokunulmadan kalır, "Giriş Yap"/"Üye Ol" gösterilir, login/register sonrası FAZ4A'daki `POST /api/cart/merge` **aynen** çağrılır — yeni bir merge mekanizması yazılmadı.

## C — Address Selection

`/checkout` mevcut `GET /api/account/addresses`'i çağırıp kullanıcının adreslerini kart olarak gösterir; seçim client state'te tutulur ama gerçek doğrulama her zaman sunucudan istenir. Checkout içinde ikinci bir adres CRUD sistemi yazılmadı — "Adres Ekle/Yönet" linki mevcut `/hesabim/adresler`'e yönlendiriyor.

## D — Address Ownership

`findOwnedAddress()` FAZ4A'da `/api/account/addresses/[id]/route.ts` içinde private tanımlıydı; checkout'un da aynı kontrole ihtiyacı olması üzerine `src/lib/address-ownership.ts`'e taşınarak **paylaşılan tek fonksiyona** dönüştürüldü (iş mantığı ikinci kez yazılmadı). Aynı 404-eşdeğeri desen: bulunamama ile başkasına ait olma arasındaki fark sızdırılmaz — ikisi de `{valid:false, errors:[{code:"ADDRESS_NOT_FOUND"}]}` (422) döner.

## E — Delivery Methods

`DELIVERY_METHODS = ["PICKUP","DELIVERY"]` (`src/lib/enums.ts`, projenin tek-kaynak enum konvansiyonu) — henüz hiçbir Prisma modeline gömülü değil, yalnızca zod şeması ve checkout-logic bu listeyi referans alıyor. UI Türkçe etiketler kullanıyor: "Mağazadan Gel-Al", "Kargo ile Teslimat". Sunucu tarafında zod `.enum()` ile doğrulanıyor — keyfi bir değer (`"HACK"`) `422 VALIDATION_ERROR` ile reddediliyor.

## F — Pickup (Gel-Al)

`getPickupLocation()` (`src/lib/pickup-location.ts`) — PickupLocationProvider soyutlaması, mevcut `Setting` tablosundaki **gerçek** işletme verisini okuyor: `contact_address_line`, `contact_phone`, `contact_hours`, `contact_maps_url`, `site_name` (FAZ1'den beri var, `/api/settings` public ucu da bunları kullanıyor). Sistemde bulunmayan TEK veri — "tahmini hazırlık süresi" — **uydurulmadı**; açık bir Türkçe placeholder metin döndü ("...daha sonra yapılandırılacaktır."). Hiçbir sahte mağaza/şube verisi üretilmedi.

## G — Shipping (Kargo)

Gerçek bir kargo API'si yok. `calculateShippingPrice("DELIVERY")` `{amount:0, computed:false, note:"Kargo ücreti henüz hesaplanmadı."}` döner — `computed:false` bu 0'ın gerçek bir hesaplama değil "henüz yok" anlamına geldiğini açıkça işaretliyor. Sahte bir kargo firması/ücret asla gösterilmedi. Kargo mantığı `computeFinalPrice()`'a gömülmedi — `calculateShippingPrice()` tamamen ayrı, kendi dosyasında, gelecekte gerçek bir kargo servisiyle değiştirilebilir.

## H — Price Validation

Checkout, cart-serialize.ts'in zaten hesapladığı `priceChanged` bayrağını `deriveCheckoutIssues()` ile **UYARI** kategorisine koyar — checkout'u bloke etmez (`valid:true` kalabilir), ama eski/yeni fiyat `warnings` alanında açıkça gösterilir; toplam her zaman güncel fiyattan hesaplanır, hiçbir zaman sessizce eski fiyatta kalmaz.

## I — Stock Validation

`stockExceeded` bayrağı **HATA** kategorisine (`STOCK_INSUFFICIENT`, `valid:false`) — checkout devam edemez, kullanıcı `/sepet`'e dönmeli. Stok fiziksel olarak hiçbir zaman değiştirilmedi: `Inventory.quantity` checkout doğrulamasında da azaltılmadı, `InventoryMovement` oluşturulmadı (E2E'de doğrudan doğrulandı).

## J — Server-Side Calculations

`computeCheckoutTotals(subtotal, shipping)` = `PRODUCT SUBTOTAL + DELIVERY COST - DISCOUNT = TOTAL`. `subtotal`, `computeFinalPrice()`'ın (mevcut pricing engine) ürettiği, cart-serialize.ts üzerinden **yeniden çağrılan** (ikinci kez yazılmayan) değerdir. Checkout-seviyesi indirim bu fazda yok (`discount:0` — ürün indirimleri zaten final fiyata yansımış).

## K — Client Manipulation Protection

`checkoutValidateSchema` yalnızca `addressId`/`deliveryMethod` alanlarını tanımlar — `price`/`subtotal`/`total`/`shippingPrice`/`quantity` şemada **hiç yok**. zod'un varsayılan "strip" davranışı gereği istemcinin gönderdiği bu alanlar route'a asla ulaşmaz; sunucu bunları HER ZAMAN kendi hesapladığı değerlerle üretir. Gerçek bir HTTP isteğinde (`price:1, subtotal:1, total:1, shippingPrice:999999, quantity:999`) test edildi — sunucu gerçek subtotal/total'ı döndü, `999999` kargo iddiası tamamen yok sayıldı.

## L — Checkout API

`POST /api/checkout/validate`: authenticated customer ister → Cart'ı server'dan bulur → address ownership kontrol eder → delivery method doğrular → ürünleri `computeFinalPrice` ile **tekrar çağırır** (tekrar yazmaz) → stokları kontrol eder → yapılandırılmış sonucu döner. **ORDER OLUŞTURMAZ, PAYMENT BAŞLATMAZ, INVENTORY DEĞİŞTİRMEZ.**

## M — Checkout UI

`/checkout` — desktop'ta 2 kolon (sol: teslimat bilgileri/yöntemi/ürün özeti, sağ: sipariş özeti — sticky), mobilde tek kolon. Progress göstergesi: Sepet(✓) → Teslimat(aktif) → Ödeme(devre dışı, "Yakında" — yanıltıcı değil). Boş sepet `/sepet`'e yönlendirilir. "Ödemeye Geç" butonu yalnızca `valid:true` iken tıklanabilir, tıklandığında gerçek ödeme **başlatmaz**, dürüst bir placeholder mesajı gösterir.

## N — Mobile UX

`checkout-grid` 860px altında tek kolona düşer, `delivery-method-grid` 480px altında tek kolona düşer. Mevcut `MobileTabBar` ile çakışma yok — checkout ayrı bir sayfa, tab bar davranışı değişmedi.

## O — AI Garden Designer Compatibility

Cart API zaten yalnızca `productId`/`quantity` kabul eden, Product/SKU temelli bir REST ucu — "yalnızca UI'dan eklenebilir" kısıtlaması yok. Checkout da aynı ilkeyle Cart'ı tek kaynak olarak okur, ürünlerin sepete nasıl girdiğiyle ilgilenmez. Bu fazda hiçbir AI API'si veya öneri motoru eklenmedi — bu yalnızca mimari uyumluluk notudur (docs/commerce.md'de dokümante edildi).

## P — Security

- Checkout authorization: `requireCustomer()`, admin/customer oturum ayrımı korunuyor.
- Address IDOR: paylaşılan `findOwnedAddress()`, 404-eşdeğeri (403 değil) desen.
- Client price/subtotal/total/shipping manipülasyonu: şemada tanımsız, sessizce elenir.
- Delivery method tahrifatı: zod enum, `"HACK"` reddedilir.
- Quantity manipülasyonu: checkout hiçbir zaman quantity kabul etmez — tek kaynak Cart.
- Sıfır side-effect: Order modeli yok, InventoryMovement oluşmuyor (E2E'de doğrudan sayıldı).

## Q — Unit Tests

Mevcut 160 test bozulmadı. Yeni: `checkout-logic.test.ts` (17 test — invalid delivery method, address snapshot, shipping calc, checkout totals, price/stock/inactive issue derivation, response structure + client manipülasyonu sonuçsuzluğu), `customer-validation.test.ts`'e 4 yeni test (`checkoutValidateSchema`). **Toplam: 181/181 test yeşil.**

| Test | Senaryo | Kapsayan |
|---|---|---|
| 1 | empty cart | E2E adım 5 |
| 2 | authenticated customer | E2E adım 4 |
| 3 | unauthorized checkout | E2E adım 2, 20 |
| 4 | address ownership (IDOR) | E2E adım 17 |
| 5 | invalid address | E2E adım 18 |
| 6 | valid PICKUP | E2E adım 9 |
| 7 | valid DELIVERY | E2E adım 10 |
| 8 | invalid delivery method | unit + E2E adım 12 |
| 9 | price revalidation | unit + E2E adım 14 |
| 10 | stock revalidation | unit + E2E adım 15 |
| 11 | inactive product | unit + E2E adım 16 |
| 12-15 | manipulated price/subtotal/total/shipping ignored | unit + E2E adım 13 |
| 16 | manipulated quantity | unit (checkoutValidateSchema) + E2E adım 13 |
| 17 | checkout response structure | unit (`assembleCheckoutResponse`) |
| 18 | guest cart preserved | E2E adım 3 |
| 19 | cart merge compatibility | E2E adım 6 |

## R — E2E

`scripts/faz4b-checkout-e2e-check.ts` — gerçek çalışan server + gerçek DB'ye karşı, self-cleaning. **39/39 assertion geçti.** Kapsam: guest checkout gate (401) + guest cart korunması, boş sepet reddi, register/login, guest→user merge, adres ekleme, geçerli PICKUP (gerçek pickup verisi + placeholder hazırlık süresi doğrulandı), geçerli DELIVERY (shipping computed:false + not doğrulandı), addressId olmadan DELIVERY reddi, geçersiz deliveryMethod reddi, client manipülasyonu (price/subtotal/total/shippingPrice/quantity) sonuçsuzluğu (4 assertion), fiyat değişikliği uyarısı (bloke etmiyor), stok yetersizliği bloke (+ InventoryMovement=0 doğrulaması), ürün arşivlenmesi bloke (+ sepetten silinmediği doğrulaması), ikinci kullanıcı ile adres IDOR, var olmayan addressId, oturumsuz erişim, Order modelinin hiç var olmadığının doğrulanması.

FAZ4A regresyon testleri de yeniden çalıştırıldı: `faz4a-commerce-e2e-check.ts` **43/43**, `faz31-price-sort-live-check.ts` ASC/DESC doğru — hiçbir mevcut davranış bozulmadı.

## S — Database Integrity

FAZ sonunda: **257 aktif ürün, 260 toplam ürün, 0 orphan, 0 duplicate.** `users: 0, addresses: 0, carts: 0, cartItems: 0` — tüm test verisi self-cleaning E2E scriptleri tarafından silindi, production DB'de hiçbir iz kalmadı. Hiçbir schema migration yapılmadı (gerek yoktu — Order/Payment/Shipping migration'ı kesinlikle yapılmadı).

## T — Build

`npm test -- --run` → 181/181 ✅
`npx tsc --noEmit` → temiz ✅
`npm run build` → temiz, `/checkout` (static) ve `/api/checkout/validate` (dynamic) route'ları listelendi ✅

## U — Documentation

`docs/commerce.md` — "FAZ 4B — Checkout Foundation + Delivery Selection" bölümü: checkout mimarisi, delivery method soyutlaması, address snapshot stratejisi, price/stock/isActive revalidation, server-side pricing, guest→customer geçişi, AI Garden Designer uyumluluğu, Order/Payment/Shipping sınırının teyidi.

`docs/security.md` — "FAZ 4B — Checkout yetkilendirme, client price manipülasyonu, teslimat/adres/toplam tahrifatı" bölümü: checkout authorization, client price manipülasyonu savunması, address IDOR (paylaşılan fonksiyon), delivery method tahrifatı, total tahrifatı, sıfır side-effect garantisi.

## V — Git Commits

1. `feat(checkout): checkout validation foundation` — enums, checkout-logic.ts, pickup-location.ts, address-ownership.ts, customer-validation.ts, `/api/checkout/validate` route, address route refaktörü.
2. `feat(checkout): delivery method selection UI` — `/checkout` sayfası, CheckoutPage.tsx, CSS, sepet CTA.
3. `test(checkout): security and pricing validation` — 21 yeni birim test + 39 assertion'lık E2E script.
4. `docs: checkout architecture` — commerce.md + security.md.

## W — Known Limitations

- **Fiyat/stok/aktiflik revalidation checkout ANI için geçerlidir** — kullanıcı checkout ekranında dururken (ör. sekmeyi açık bırakıp geri dönmeden) arka planda fiyat/stok değişirse, bir sonraki `POST /api/checkout/validate` çağrısına kadar UI eski sonucu gösterir. Bu, gerçek bir rezervasyon sistemi olmadığı için (bilinçli, Bölüm 13/26) kaçınılmaz bir sınırdır — gelecekteki checkout/order fazında ele alınacaktır.
- **Checkout-seviyesi indirim/kupon mekanizması yok** — `discount` alanı response'ta her zaman `0`; yalnızca ürün bazlı kampanya indirimleri (`computeFinalPrice`) yansır.
- **Kargo ücreti her zaman "henüz hesaplanmadı"** — gerçek bir kargo API'si entegre edilene kadar `DELIVERY` seçiminde her zaman `computed:false` döner; bu bilinçli, Bölüm 8'in doğrudan gereğidir.
- **"Tahmini hazırlık süresi" verisi yok** — Gel-Al konum bilgisinin geri kalanı (adres/telefon/saat) gerçek `Setting` verisinden geliyor, ama hazırlık süresi için sistemde hiç veri yok; açık placeholder kullanıldı, uydurulmadı.
- **Checkout state client'ta tutuluyor ama source of truth değil** — seçili adres/teslimat yöntemi yalnızca UI kolaylığı; sayfa yenilendiğinde seçim sıfırlanır (kasıtlı — kalıcı bir "taslak checkout" durumu bu fazda tasarlanmadı, Order olmadan anlamlı bir kalıcılık noktası yok).
- **"Ödemeye Geç" placeholder'dır** — hiçbir gerçek ödeme adımına bağlanmıyor, yalnızca bilgilendirici bir mesaj gösteriyor; gerçek ödeme entegrasyonu (iyzico/PayTR/Stripe vb.) kesinlikle bu fazda YOK.
- **Order/Payment/Shipping/Invoice/InventoryReservation modeli oluşturulmadı** — bu fazın kesin sınırı, tekrar teyit edilir: hiçbiri eklenmedi.

---

**FAZ 4C'YE GEÇİLMEDİ.** Yalnızca bu rapor teslim ediliyor, kullanıcı onayı bekleniyor.
