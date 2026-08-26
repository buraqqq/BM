# Ticari altyapı hazırlığı (FAZ 3 — Bölüm 8)

## Kapsam

FAZ 3'te **ödeme/sipariş işleme alınmadı**. Bu doküman yalnızca, kullanıcının belirttiği hedef akışın veri modeli açısından ne kadarının hazırlandığını ve neyin bilinçli olarak ertelendiğini kayıt altına alır:

```
Ürün
 ↓
Sepete Ekle   ← FAZ 3'te yalnızca ŞEMA eklendi, UI/API eklenmedi
 ↓
Cart          ← FAZ 3'te ŞEMA eklendi (Cart, CartItem)
 ↓
Customer      ← FAZ 1'den beri var: User modeli
 ↓
Address       ← FAZ 1'den beri var: Address modeli
 ↓
Gel-Al / Kargo ← FAZ 3'te HİÇBİR model eklenmedi
 ↓
Payment       ← FAZ 3'te HİÇBİR model eklenmedi
```

## Eklenenler (FAZ 3)

`prisma/schema.prisma`'ya iki yeni model eklendi (migration: `20260826191555_faz3_commerce_prep`):

- **`Cart`**: `userId` (opsiyonel — giriş yapmış kullanıcı) veya `sessionToken` (opsiyonel — misafir sepeti) ile ilişkilendirilebilir; `status` (`ACTIVE`/`CONVERTED`/`ABANDONED`, bkz. `src/lib/enums.ts` `CART_STATUSES`).
- **`CartItem`**: `cartId` + `productId` (benzersiz çift — aynı üründen sepette tek satır), `quantity`, `unitPriceAtAdd` (ekleme anındaki birim fiyat — ileride "fiyat değişti" uyarısı için).

Bu iki model **hiçbir API rotası veya UI tarafından şu an okunmuyor/yazılmıyor**. Yalnızca gelecekteki bir "Sepete Ekle" özelliğinin üzerine doğrudan inşa edilebileceği bir zemin olarak eklendi — kullanıcının "ticari altyapı hazırlığı" talebi bu şekilde karşılandı, çalışan bir sepet UI'ı oluşturulmadı (bu FAZ'ın kapsamı dışında tutulduğu netleştirildi).

## Zaten var olanlar (FAZ 1'den, yeniden tanımlanmadı)

- **Customer** karşılığı: `User` modeli (`email`, `name`, `phone`, `passwordHash` — opsiyonel, misafir kullanım için `passwordHash: null` olabilir).
- **Address**: `Address` modeli (`userId`, `label`, `line1/line2`, `city`, `district`, `postalCode`, `phone`, `isDefault`).

Her ikisi de FAZ 1'de eklenmişti ve hâlâ hiçbir müşteri-facing özelliğe bağlı değil — herhangi bir gerçek kullanıcı/adres kaydı yok.

## Bilinçli olarak ertelenenler

- **Gel-Al / Kargo seçimi**: teslimat yöntemi (mağazadan teslim alma vs. kargo), kargo firması entegrasyonu, teslimat ücreti hesaplama — hiçbiri netleşmediği için model eklenmedi. Şimdiden bir `DeliveryMethod` enum'u veya `ShippingOption` modeli eklemek, kullanıcının "veri uydurma" prensibiyle (bu kez şema için) çelişirdi — gerçek iş kuralları (hangi bölgelere kargo, gel-al saatleri vb.) belirlenmeden bir şema taahhüt etmek yanlış olur.
- **Payment**: ödeme sağlayıcısı (iyzico, PayTR, banka havalesi vb.) seçilmediği için hiçbir `Payment`/`Order` modeli eklenmedi.
- **Order**: `Cart` → `Order`'a "dönüştürme" akışı (checkout) tanımlanmadığı için `Order` modeli de eklenmedi — `Cart.status = "CONVERTED"` alanı bu geçişin ileride nereye bağlanacağının yer tutucusu.

## Mevcut "sipariş" mekanizması (değişmedi)

FAZ 1'den beri (ve FAZ 3'te de) sitedeki tek gerçek sipariş yolu **WhatsApp'tır** — her ürün kartı/detay sayfası "WhatsApp ile Sipariş Ver" (kartlarda kısaca "Sipariş Ver") butonuna sahiptir, ürün adı otomatik mesaja eklenir. Bu buton bilinçli olarak "Sepete Ekle" diye ETİKETLENMEDİ — gerçek bir sepet biriktirme deneyimi yok, yanıltıcı bir buton adı koymamak için WhatsApp akışıyla tutarlı, dürüst bir etiket kullanıldı (bkz. `src/app/urun/[slug]/page.tsx`, `src/components/ProductCard.tsx`).

## Cart/CartItem şema güvenlik incelemesi (FAZ 3.1 — Bölüm 7)

Henüz çalışan bir sepet UI'ı yok (yukarıdaki "Bilinçli olarak ertelenenler" bölümü) — ama şemanın kendisinin, ileride gerçek veri taşımaya başladığında güvenli davranacağı FAZ3.1'de doğrulandı. **Hiçbir yeni model eklenmedi** (Order/Payment/Shipping/Gel-Al — kullanıcı talimatı gereği kesinlikle oluşturulmadı), yalnızca mevcut `Cart`/`CartItem` şeması incelendi:

| Senaryo | Şema davranışı | Doğrulama |
|---|---|---|
| **Product hard-delete edilirse** | `CartItem.product` ilişkisi `onDelete: Cascade` — ürün silindiğinde ona ait tüm `CartItem` satırları otomatik silinir, orphan `CartItem` OLUŞAMAZ. | `prisma/migrations/20260826191555_faz3_commerce_prep/migration.sql`'de `CONSTRAINT "cart_items_productId_fkey" ... ON DELETE CASCADE` olarak doğrulandı. Ayrıca not: ürün `DELETE` uçları zaten her zaman `405 HARD_DELETE_DISABLED` döner (bkz. `docs/security.md`) — bu senaryo pratikte hiç gerçekleşmiyor, ama şema yine de savunmalı. |
| **Product arşivlenirse (`isActive=false`)** | Bu bir **soft delete** — FK'ye hiç dokunmaz, `CartItem.productId` geçerli kalır, `Product` satırı olduğu gibi durur. Şema seviyesinde HİÇBİR sorun yok. | Kod okuması ile doğrulandı: `isActive` alanı `CartItem`/`Cart` şemasında hiçbir yerde referans edilmiyor. **Uygulama-seviyesi not (ileride gerçek sepet UI'ı yazılırken)**: sepet ekranı, göstermeden önce `product.isActive`'i kontrol etmeli ve arşivlenmiş bir ürünü "artık satışta değil" diye işaretlemeli/çıkarmalı — bu FAZ3.1'in kapsamında bir UI olmadığı için henüz yazılmadı, yalnızca gelecekteki implementasyon için not edildi. |
| **Product fiyatı değişirse** | `CartItem.unitPriceAtAdd`, ekleme anındaki fiyatın bir SNAPSHOT'ı — `Product.price` değiştiğinde OTOMATİK GÜNCELLENMEZ (kasıtlı tasarım, bkz. yukarıdaki "Eklenenler" bölümü). Orphan/tutarsız veri riski yok; yalnızca "sepetteki fiyat, güncel liste fiyatından farklı olabilir" durumu oluşur — bu, e-ticaret sistemlerinde standart ve BEKLENEN bir davranıştır (checkout anında yeniden doğrulanır). | Şema alanı (`unitPriceAtAdd Decimal`, `@updatedAt` DEĞİL) kod okumasıyla doğrulandı — hiçbir tetikleyici/trigger bu alanı senkronize etmiyor, tasarım gereği. |

**Sonuç**: üç senaryo da şema seviyesinde güvenli. Gerçek bir sepet UI'ı yazılırken tek ek iş, "arşivlenmiş ürün" ve "fiyat değişti" durumlarını checkout ANINDA (DB şemasında değil, uygulama mantığında) ele almaktır — bu not, ileride o özelliği yazacak kişi/oturum için burada bırakıldı.

## AI Ürün Eşleştirme (Product Matching) — mimari zincir (FAZ 3.1 — Bölüm 8, yalnızca dokümantasyon)

İleride bir AI destekli ürün eşleştirme/öneri katmanı eklenmek istendiğinde, izleyeceği veri zinciri zaten mevcut mimaride şu şekilde uçtan uca kurulu durumda (hiçbir AI API'si bu fazda YAZILMADI — bu yalnızca "hangi parça nerede" haritası):

```
AI Requirement (kullanıcının doğal dil isteği, ör. "güneşte kalabilecek ucuz bir hortum")
     ↓
Category                    — src/lib/category-tree.ts (materialized path ağacı;
                               getCategorySubtreeIds() bir kategori + tüm alt
                               ağacını O(1) indexed sorguyla verir)
     ↓
Product Attributes           — ProductAttributeDefinition/ProductAttributeValue
                               (kategori bazlı esnek özellik şeması, ör. "güneş
                               ihtiyacı", "uzunluk" — bkz. schema.prisma Bölüm 10);
                               serializePublicProduct().specs alanında herkese
                               açık API'den zaten dışa veriliyor (bkz. src/lib/serialize.ts)
     ↓
SKU                          — Product.sku (benzersiz, insan-okunur ürün kimliği;
                               arama zaten bunu kapsıyor, bkz. src/lib/search.ts)
     ↓
Inventory                    — Inventory.stockStatus (yalnızca "stokta var/yok",
                               müşteriye asla adet gösterilmez — bkz. serializePublicProduct)
     ↓
Final Customer Price         — src/lib/pricing.ts computeFinalPrice() (TEK
                               doğruluk kaynağı — kampanya+manuel indirim sonrası
                               gerçek satış fiyatı; bkz. FAZ3.1 Bölüm 1, artık
                               sıralamada da bu kullanılıyor: src/lib/price-sort.ts)
     ↓
Cart                          — Cart/CartItem (yalnızca şema, bkz. yukarısı) —
                               bir AI önerisi "sepete ekle" aksiyonuna dönüşmek
                               isterse, ekleyeceği yer burası olurdu
```

Bu zincirin her halkası **bugün zaten çalışan, gerçek kod** — AI katmanı eklenirse (ör. "bu kritere uyan ürünleri bul" gibi bir arama/öneri motoru), `src/lib/search.ts`'in başındaki mimari nota göre `buildProductSearchWhere`'in ürettiği adayları girdi olarak alıp üstüne bir semantik yeniden-sıralama (rerank) katmanı eklemesi yeterli olur — mevcut route handler'lar veya bu zincirdeki hiçbir parça yeniden yazılmadan. Bu fazda hiçbir AI API'si veya öneri motoru GELİŞTİRİLMEDİ; bu bölüm yalnızca mimari dokümantasyondur.

## FAZ 4A — Customer Account + Cart Foundation

FAZ 3'ün "yalnızca şema" hazırlığı, bu fazda **gerçekten çalışan** müşteri hesabı ve sepetle dolduruldu — ödeme/sipariş işleme **hâlâ alınmadı** (bkz. "Kesinlikle Yapılmayanlar" altında).

### Kimlik doğrulama — tek NextAuth, iki provider

Ayrı bir "müşteri authentication sistemi" **inşa edilmedi**. Mevcut NextAuth (`src/lib/auth.ts`) admin akışının (`credentials`) yanına, ikinci bir `CredentialsProvider` (`customer-credentials`) eklendi — `User` modeli + bcrypt (cost 12, admin seed script'iyle aynı) ile doğrulanıyor. Oturum artık `session.user.kind: "admin" | "customer"` ile ayrışıyor; `requireAdmin()`/`requireCustomer()` (bkz. `src/lib/require-admin.ts`, `src/lib/require-customer.ts`) bu alanı kontrol ederek iki oturum türünün birbirinin API'lerine asla erişemediğini garanti eder — bu, `scripts/faz4a-commerce-e2e-check.ts` ile gerçek HTTP istekleriyle doğrulandı (bkz. FAZ4A raporu). Brute-force koruması (`LoginAttempt` tablosu, `isLoginRateLimited`/`recordLoginAttempt`) admin ile **aynı**, tek tablo üzerinden çalışıyor.

### Guest cart (misafir sepeti)

Kimliği doğrulanmamış bir ziyaretçi sepete ürün eklediğinde, `Cart.sessionToken` alanına bağlı, rastgele bir (`crypto.randomUUID()`) token üretilir ve **HttpOnly + secure + SameSite=Lax** bir cookie'de (`bm_guest_cart`, 30 gün) taşınır (bkz. `src/lib/cart-session.ts`). Gerçek kaynak (source of truth) her zaman DB'deki `Cart`/`CartItem` satırlarıdır — cookie yalnızca "hangi Cart satırı" referansını taşır, sepetin içeriği hiçbir zaman `localStorage`'da veya cookie'nin kendisinde tutulmaz.

### Authenticated cart (kimliği doğrulanmış sepet)

Müşteri giriş yaptığında sepeti artık `Cart.userId` üzerinden bulunur/oluşturulur — `GET /api/cart` hem misafir hem kimliği doğrulanmış istekte AYNI uçtur, farkı iç kısımda (`resolveCart`) çözülür, istemci tarafında hiçbir dallanma gerekmez (bkz. `src/components/CartPage.tsx`).

### Cart merge (giriş sonrası birleştirme)

Login sonrası istemci `POST /api/cart/merge`'i çağırır (bkz. `src/components/LoginForm.tsx`, `RegisterForm.tsx`). Sunucu tarafında: guest cookie'deki sepet + kullanıcının (varsa) mevcut sepeti bulunur, aynı üründe miktarlar toplanır (stok limitini aşmaz — bkz. `src/lib/cart-logic.ts` `mergeCartItems`, saf/DB'siz karar mantığı), birleşen satırlar için `computeFinalPrice` YENİDEN çağrılarak `unitPriceAtAdd` tazelenir, guest `Cart` silinir ve cookie temizlenir — tamamı tek bir `$transaction` içinde (race condition'a karşı, bkz. Bölüm 29 talimatı).

### Price snapshot (fiyat anlık görüntüsü)

Sepete eklenirken `CartItem.unitPriceAtAdd`, `computeFinalPrice()` (mevcut pricing engine, `src/lib/pricing.ts`) ile hesaplanıp kaydedilir — fiyat hesaplama mantığı **ikinci kez yazılmadı**. Bu alan bir SNAPSHOT'tır, ürün fiyatı/kampanyası sonradan değiştiğinde OTOMATİK güncellenmez (kasıtlı, FAZ3'ten beri dokümante edilmiş tasarım).

### Price/stock/isActive revalidation (görüntülemede yeniden doğrulama)

`GET /api/cart` (ve her mutation'ın döndürdüğü sepet gövdesi) her satır için GÜNCEL final fiyatı yeniden hesaplar, `unitPriceAtAdd` ile karşılaştırır (`priceChanged`), güncel stoğu (`Inventory.quantity`) `stockExceeded` olarak işaretler, ve ürünün hâlâ `isActive` olup olmadığını gösterir — bkz. `src/lib/cart-serialize.ts`. Hiçbiri SESSİZCE uygulanmaz: `unitPriceAtAdd` DB'de değiştirilmez, satır silinmez; kullanıcı `/sepet` sayfasında (`src/components/CartPage.tsx`) eski/yeni fiyatı, "stok yetersiz" ve "artık satışta değil" uyarılarını açıkça görür. Sepete ekleme/güncelleme sırasında ayrıca stok aşımı **reddedilir** (409) — ama bu bir REZERVASYON değildir: `Inventory.quantity` hiçbir şekilde değiştirilmez, `InventoryMovement` oluşturulmaz. Gerçek stok rezervasyonu, gelecekteki checkout fazının kapsamındadır.

### Address ownership (adres sahiplik/IDOR savunması)

`Address` modeli FAZ4A'da gerçekten kullanılmaya başlandı (FAZ1'den beri şemada duran ama 0 satırlı haliyle karşılaştırıldığında yeniden tanımlandı — bkz. migration `20260826200157_faz4a_customer_account_address_rework`, veri kaybı yok çünkü taşınacak gerçek veri yoktu). Her `/api/account/addresses/:id` isteği önce adresi id'ye göre bulur, SONRA `address.userId === session.user.id` kontrol eder; eşleşmezse (adres hiç yoksa da, BAŞKASINA aitse de) AYNI `404 NOT_FOUND` döner — 403 değil, bilinçli bir seçim (bkz. `docs/security.md`). `/api/cart/items/:id` de aynı deseni (`resolveOwnedItem`, `item.cartId !== resolved.cart.id` → 404) kullanır. İkisi de `scripts/faz4a-commerce-e2e-check.ts`'te GERÇEK ikinci bir kullanıcı ile GET/PATCH/DELETE denemeleri yapılarak doğrulandı.

### Future checkout boundary (gelecekteki checkout sınırı) — FAZ4A'da yazılmıştı, FAZ4B ile güncellendi

FAZ4A'da "gelecekteki bir faza bırakıldı" denen checkout'un **temeli** FAZ4B'de kuruldu (bkz. aşağıdaki bölüm) — ama gerçek sınır (Order/Payment/Shipping) YERİNDE KALDI, yalnızca bir adım öne (checkout preview/validation) taşındı. `Cart.status` hâlâ yer tutucu; hiçbir kod `CONVERTED`'a geçiş yazmıyor. Sitedeki tek gerçek sipariş yolu hâlâ **WhatsApp'tır**.

## FAZ 4B — Checkout Foundation + Delivery Selection

FAZ4A'nın "Cart → Customer → Address" temelinin üzerine, **Order OLUŞTURMADAN** (bu fazda hâlâ yasak — bkz. aşağıdaki sınır) sepetten ödemeye giden akışın önizleme/doğrulama katmanı kuruldu: `/checkout` sayfası + `POST /api/checkout/validate` ucu.

### Checkout mimarisi

Tek yeni API ucu: `POST /api/checkout/validate` (`src/app/api/checkout/validate/route.ts`). Bu uç **hiçbir DB satırı yaratmaz/değiştirmez** — yalnızca mevcut Cart/Address/Product/Inventory verisini okur, sunucu tarafında yeniden hesaplar ve yapılandırılmış bir önizleme döner. Tüm saf karar mantığı (`isValidDeliveryMethod`, `buildAddressSnapshot`, `calculateShippingPrice`, `computeCheckoutTotals`, `deriveCheckoutIssues`, `assembleCheckoutResponse`) `src/lib/checkout-logic.ts`'te DB'siz, birim test edilebilir fonksiyonlar olarak tutuldu — route.ts yalnızca bunları çağıran ince bir DB-orkestrasyon katmanı (mevcut `cart-logic.ts`/`address-rules.ts` deseniyle bire bir aynı).

Response şekli her zaman tek biçim: `{valid:true, cart, delivery, pricing, warnings}` ya da `{valid:false, errors}` — bu şekil `assembleCheckoutResponse()` tarafından TEK bir yerde üretilir.

### Delivery method abstraction (teslimat yöntemi soyutlaması)

`DELIVERY_METHODS = ["PICKUP", "DELIVERY"]` (`src/lib/enums.ts`, projenin "SQLite enum desteklemiyor, tek kaynak enums.ts" konvansiyonuyla tutarlı) — henüz hiçbir Prisma modeline gömülü değil (Order yok), yalnızca zod şeması ve checkout-logic bu listeyi referans alıyor. Gelecekte üçüncü bir yöntem (ör. `EXPRESS_DELIVERY`) eklenmesi tek bir listeye eklemekle sınırlı kalacak şekilde tasarlandı.

- **PICKUP (Gel-Al)**: `getPickupLocation()` (`src/lib/pickup-location.ts`) mevcut `Setting` tablosundaki **gerçek** işletme verisini (`contact_address_line`, `contact_phone`, `contact_hours`, `contact_maps_url`, `site_name` — FAZ1'den beri var, `/api/settings` public ucu da bunları kullanıyor) okur. Sistemde gerçekten bulunmayan TEK veri — "tahmini hazırlık süresi" — uydurulmadı, açık bir yer tutucu metinle döndü.
- **DELIVERY (Kargo)**: gerçek bir kargo API'si yok — `calculateShippingPrice("DELIVERY")` `{amount:0, computed:false, note:"Kargo ücreti henüz hesaplanmadı."}` döner. `computed:false` bayrağı, bu 0'ın gerçek bir hesaplama DEĞİL "henüz yok" anlamına geldiğini API tüketicisine (ve UI'a) açıkça işaretler.

Kargo mantığı `computeFinalPrice()`'a (pricing engine) **gömülmedi** — `calculateShippingPrice()` tamamen ayrı, kendi dosyasında; ileride gerçek bir kargo API'si eklendiğinde yalnızca bu fonksiyonun gövdesi değişecek.

### Address snapshot stratejisi (Bölüm 5)

`buildAddressSnapshot()` (`src/lib/checkout-logic.ts`) seçilen `Address` kaydından, ileride bire bir bir `OrderAddressSnapshot` satırına kopyalanabilecek sabit bir alan kümesini (firstName/lastName/phone/city/district/neighborhood/addressLine/postalCode/country) PICK eder — `id`/`userId`/`isDefault`/`title` gibi checkout'ta anlamsız/gereksiz alanlar sızmaz. **`OrderAddressSnapshot` modeli bu fazda oluşturulmadı** — yalnızca ileride kolayca eklenebilecek bir alan sözleşmesi (contract) hazırlandı; müşteri adresini sonradan değiştirse/silse bile checkout anında üretilen bu nesne, checkout isteğinin ömrü boyunca bağımsız kalır (kalıcı olarak saklanmıyor, yalnızca response'ta dönüyor).

### Price/stock/isActive revalidation (checkout'ta yeniden doğrulama)

Checkout, cart-serialize.ts'in **zaten** hesapladığı güncel bayrakları (`isActive`/`priceChanged`/`stockExceeded`) `deriveCheckoutIssues()` ile iki kategoriye ayırır:

- **Hata (checkout'u BLOKE eder, `valid:false`)**: satıştan kalkmış ürün (`PRODUCT_INACTIVE`) veya yetersiz stok (`STOCK_INSUFFICIENT`). Kullanıcı `/sepet`'e dönüp düzeltmeli — checkout içinde ikinci bir ürün/quantity yönetimi YOK (Bölüm 13).
- **Uyarı (checkout'a İZİN VERİR, `valid:true` kalabilir)**: yalnızca fiyat değişikliği (`PRICE_CHANGED`) — toplam her zaman GÜNCEL fiyattan hesaplanır (Cart'takiyle aynı ilke), eski/yeni fiyat kullanıcıya `warnings` alanında açıkça gösterilir, hiçbir zaman sessizce uygulanmaz.

Hiçbiri stok/envanter satırını değiştirmez: `Inventory.quantity` checkout doğrulamasında da (cart'ta olduğu gibi) hiçbir şekilde azaltılmaz, `InventoryMovement` oluşturulmaz — bu, `scripts/faz4b-checkout-e2e-check.ts`'te doğrudan doğrulandı.

### Server-side pricing (client manipülasyonu savunması)

`checkoutValidateSchema` (`src/lib/customer-validation.ts`) yalnızca `addressId` ve `deliveryMethod` alanlarını tanımlar — `price`/`subtotal`/`total`/`shippingPrice`/`quantity` gibi hiçbir alan şemada YOK. zod'un varsayılan davranışı (strip) gereği istemci bunları gönderse bile route bunları **hiçbir zaman okuyamaz**; sunucu `subtotal`/`shipping`/`total`'ı HER ZAMAN kendi `computeFinalPrice()`+`computeCheckoutTotals()` zincirinden hesaplar. `scripts/faz4b-checkout-e2e-check.ts`, gerçek bir HTTP isteğinde bu alanları manipüle ederek (`price:1, total:1, shippingPrice:999999` vb.) sunucunun bunları görmezden geldiğini ve gerçek değerleri döndürdüğünü doğruladı.

### Guest → customer checkout transition (Bölüm 3/21)

Checkout **yalnızca authenticated customer** için çalışır (`requireCustomer()` — FAZ4A'dan aynen yeniden kullanıldı). Guest bir kullanıcı `/checkout`'a geldiğinde: sepeti/guest cookie'si **dokunulmadan** kalır, UI "Giriş Yap"/"Üye Ol" seçenekleri gösterir (`src/components/CheckoutPage.tsx`). Login/register sonrası istemci **FAZ4A'daki** `POST /api/cart/merge` ucunu çağırır — checkout için YENİ bir merge mekanizması YAZILMADI.

### AI Garden Designer future integration (Bölüm 20)

Cart API (`POST /api/cart/items`) zaten yalnızca `productId`/`quantity` kabul eden, ürünleri Product/SKU temelinde ekleyen bir REST ucu — "yalnızca UI'dan eklenebilir" şeklinde bir kısıtlama YOK, ileride kimliği doğrulanmış bir server-to-server çağrı (ör. bir AI Garden Designer'ın önerdiği ürün listesini sepete aktarması) aynı ucu, aynı stok/aktiflik kontrolleriyle kullanabilir. Checkout ucu da aynı ilkeyle: `Cart`'ı TEK kaynak olarak okur, ürünlerin sepete NASIL girdiğiyle ilgilenmez. **Bu fazda hiçbir AI API'si veya öneri motoru eklenmedi** — bu bölüm yalnızca mimari uyumluluk notudur (FAZ3.1'deki "AI Garden Designer uyumluluğu" notuyla aynı ilke).

### Order/Payment/Shipping boundary (kesin sınır — FAZ4B'de de değişmedi)

Bu fazda **kesinlikle eklenmeyenler**: `Order`/`OrderItem`/`OrderAddressSnapshot` modeli, `Payment`/`PaymentTransaction` modeli, `Shipping`/`InventoryReservation` modeli, `Invoice` modeli, ödeme sağlayıcı entegrasyonu (iyzico/PayTR/Stripe/Shopier/PayPal/banka API), gerçek kargo API entegrasyonu (Aras/Yurtiçi/MNG/PTT/Sürat/HepsiJET). `/checkout` sayfasındaki "Ödemeye Geç" butonu **hiçbir gerçek ödeme başlatmaz** — tıklandığında yalnızca "ödeme adımı yakında aktif olacak" placeholder mesajı gösterir, asla "ödeme başarılı" gibi yanıltıcı bir metin YAZDIRMAZ. Sitedeki tek gerçek sipariş yolu hâlâ **WhatsApp'tır**.
