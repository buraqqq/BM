# B&M VOURLA — FAZ 4C TAMAMLANMA RAPORU
## Checkout Validation → Secure Order Creation → Inventory Update → Order History → Admin Order Management

Tarih: 2026-08-27

---

## A — Amaç ve kapsam

FAZ 4B'nin **yalnızca-doğrulayan** (`POST /api/checkout/validate`, DB'ye yazmayan)
checkout akışı, FAZ 4C'de **gerçek sipariş oluşturmaya** taşındı. Zincir
tamamlandı:

```
Sepet → Checkout Validation → Order Creation → Inventory Update
                                            → Customer Order History
                                            → Admin Order Management
```

**Kesin sınır**: gerçek ödeme sağlayıcısı (iyzico/PayTR/Stripe/kredi kartı/
banka) YOK. `paymentStatus` her zaman `PENDING` başlar; sahte "ödeme alındı"
durumu üretilmez.

Mevcut sistem **yeniden yazılmadı**: `computeFinalPrice` (pricing engine),
`computeCheckoutTotals`/`calculateShippingPrice` (checkout-logic),
`resolveCart`/`serializeCart` (cart), `findOwnedAddress` (address ownership),
`requireCustomer`/`requireAdmin`, `writeAuditLog`, `deriveStockStatus` hepsi
aynen yeniden kullanıldı.

## B — Order veri modeli

`prisma/schema.prisma`'ya 4 yeni model eklendi (migration:
`20260826224316_faz4c_orders`):

- **Order** — `orderNumber` (@unique), `cartId` (@unique, idempotency), `userId`,
  `status`, `paymentStatus`, `deliveryMethod`, `currency`, `subtotal`,
  `discount`, `shippingAmount`, `shippingComputed`, `shippingNote`, `total`,
  `customerNote` (geleceğe hazır), `createdAt`/`updatedAt`.
- **OrderItem** — `productId` (opsiyonel, `onDelete: SetNull`), `productName`,
  `sku`, `quantity`, `unitPrice`, `lineTotal` (tümü snapshot).
- **OrderAddressSnapshot** — sipariş anındaki adresin donmuş kopyası
  (`orderId` @unique).
- **OrderStatusHistory** — durum geçiş zaman çizelgesi (`fromStatus` nullable,
  ilk durum için null).

`Address` modeli siparişin doğrudan kaynağı olarak kullanılmadı; müşteri adresini
sonradan değiştirirse/silerse geçmiş sipariş etkilenmez.

**Sipariş numarası**: `BM-XXXXXXXX` — 32 karakterlik alfabe (0/O, 1/I çıkarıldı),
`crypto.randomBytes` ile üretilir, tahmin edilmesi zor, URL/destekte kullanılabilir,
`@unique` DB constraint ile çakışma engellenir.

## C — OrderItem snapshot

Sipariş satırı, ürünün gelecekte değişebilir alanlarını (ad/SKU/fiyat) donuk
olarak saklar. `unitPrice` = sipariş anındaki **GERÇEK final fiyat**
(`computeFinalPrice` çıktısı — pricing engine ikinci kez yazılmadı, tekrar
çağrıldı). `lineTotal` = `quantity × unitPrice` (kuruşa yuvarlanır).

## D — Order status modeli (lifecycle)

`src/lib/order-logic.ts` içinde **saf, DB'siz** geçiş kuralları (birim testli):

```
PENDING → CONFIRMED → PREPARING → READY → SHIPPED → COMPLETED
   │          │           │         │
   └──────────┴───────────┴─────────┴──→ CANCELLED
```

`CANCELLED → SHIPPED` gibi mantıksız geçişler server-side reddedilir (422
`INVALID_TRANSITION`). Terminal durumlar (`COMPLETED`, `CANCELLED`) boş dizi.

## E — Payment status

`PAYMENT_STATUSES = PENDING | PAID | FAILED | REFUNDED` (`enums.ts`). `CANCELLED`
bilinçli olarak listede yok (sipariş iptali `Order.status`'ta). Gerçek ödeme
başlatılmaz; admin yalnızca **manuel** `paymentStatus` güncelleyebilir (audit'e
tabi).

## F — Order creation endpoint

`POST /api/orders` (`src/app/api/orders/route.ts`): `requireCustomer` → cart bul
→ boşsa 422 → delivery/adres doğrula → ürünleri yeniden oku → aktif/stok/fiyat
yeniden doğrula → server-side subtotal/shipping/total → tek `$transaction`
içinde sepet claim + stok + Order + snapshot'lar. Gövde yalnızca `addressId` +
`deliveryMethod` içerir (checkoutValidateSchema, FAZ 4B'den aynen); parasal
değerlerin tamamı sunucuda hesaplanır.

## G — Inventory ve stok

- Sepet/checkout **stok rezervasyonu değildir** (FAZ 4A/4B korundu).
- Sipariş transaction'ı içinde stok **atomik** düşülür:
  `updateMany({ where: { quantity: { gte: X } }, data: { decrement: X } })` —
  negatif stoğa düşmek SQL düzeyinde imkânsız; `count=0` → transaction geri
  alınır (422 `STOCK_INSUFFICIENT`).
- Başarılı siparişte `InventoryMovement(type: "SALE", quantityChange: -X,
  resultingQuantity, reason: "Sipariş <no>")` + `deriveStockStatus` ile
  `stockStatus` tazelenir.

## H — Cart finalization + duplicate protection

Başarılı siparişte sepet `ACTIVE → CONVERTED`'a çekilir. Claim `updateMany` ile
**atomik**tir + `Order.cartId` `@unique`'dir → aynı sepetten ikinci sipariş
yapısal olarak oluşamaz. İkinci istek `409 ORDER_ALREADY_CREATED` (mevcut sipariş
numarasıyla) veya `422 EMPTY_CART` alır.

## I — Checkout UI

`/checkout`'taki "Ödemeye Geç" placeholder'ı **"Siparişi Oluştur"** oldu; buton
`POST /api/orders` çağırır, başarıda `/siparis/[orderNumber]` sayfasına gider.
Progress göstergesi: Sepet → Teslimat → Sipariş. Başarı sayfasında sipariş
numarası, tarih, durum, ödeme durumu, ürünler/adetler/fiyatlar, ara toplam,
kargo, genel toplam, adres ve durum geçmişi gösterilir. Yanıltıcı "ödeme alındı"
mesajı yok.

## J — Customer order history

`/hesabim/siparislerim` + `GET /api/orders` (pagination'lı). Yalnızca
`userId = session.user.id` filtresi — başka kullanıcının siparişi listeye girmez.

## K — Order detail authorization (IDOR)

`GET /api/orders/[orderNumber]`: var olmayan ve başkasına ait sipariş AYNI 404
`ORDER_NOT_FOUND` döner (varlık bilgisi sızdırılmaz — `findOwnedAddress` deseninin
order karşılığı).

## L — Admin order management

`/admin/orders` (list + durum filtresi + sipariş no arama + pagination) ve
`/admin/orders/[orderNumber]` (detay + snapshot'lar + müşteri + durum/ödeme
durumu yönetimi). Durum geçişleri server-side doğrulanır; her durum/ödeme
değişikliği `writeAuditLog` ile (`ORDER_STATUS_UPDATE`,
`ORDER_PAYMENT_STATUS_UPDATE`) kaydedilir. Admin uçları `requireAdmin(["ADMIN",
"SUPER_ADMIN"])` gerektirir (müşteri PII — STAFF hariç).

## M — Order status history

Müşteri-güvenli yaşam döngüsü zaman çizelgesi için ayrı `OrderStatusHistory`
tablosu kullanıldı (ilk `PENDING` dahil). Admin "kim/IP" kaygısı AuditLog'da
ayrı tutuldu — iki kaygı ayrı; gerekçe docs/commerce.md'de.

## N — Delivery information

`PICKUP`/`DELIVERY` (FAZ 4B korundu). PICKUP gerçek `Setting` verisinden gelir
(sahte mağaza bilgisi yok). DELIVERY'de `calculateShippingPrice` davranışı
korundu; `computed:false` order snapshot'ına da işlendi (0 TL gerçek "ücretsiz
kargo" gibi gösterilmez). Shipping bilgisi Order'a snapshot olarak kaydedilir.

## O — Security (test edilen saldırı senaryoları)

Guest `POST /api/orders` → 401 ✅ · Admin müşteri siparişi oluşturamaz ✅ · Boş
sepet → 422 ✅ · Başkasının `addressId`'si → 422 IDOR ✅ · Client fiyat/toplam/
quantity manipülasyonu → yok sayılır (şemada tanımsız) ✅ · Stok yetersizliği →
422 ✅ · Sipariş öncesi pasifleşen ürün → 422 ✅ · Duplicate submit → tek sipariş
✅ · Başkasının order detail'ı → 404 ✅ · Müşteri admin uca erişemez ✅ · Geçersiz
transition → 422 ✅ · `CANCELLED → SHIPPED` → 422 ✅ · Negatif stok → imkânsız ✅ ·
Yarım Order/Inventory kalmaz (tek transaction) ✅.

## P — Unit testler

Mevcut 181 test bozulmadı. Yeni: `src/lib/__tests__/order-logic.test.ts` (14 test:
status transitions, type guards, order number generation, line snapshot + subtotal).
**Toplam: 195/195 yeşil** (19 dosya).

## Q — E2E test

`scripts/faz4c-order-e2e-check.ts` — gerçek çalışan server + gerçek DB'ye karşı,
self-cleaning. **31/31 assertion geçti.** Kapsam: guest gate, kayıt/giriş, boş
sepet, PICKUP order (+ snapshot doğrulama), stok düşme + SALE hareketi + sepet
CONVERTED, duplicate submit, sipariş-anı stok yetersizliği, pasif ürün reddi,
DELIVERY order (+ shipping `computed:false` + adres snapshot), address IDOR,
order detail IDOR, müşteri geçmişi, müşteri↔admin izolasyonu, admin list/detail,
geçerli transition, geçersiz transition, durum geçmişi + audit log, temizlik
sonrası baseline (257 aktif / 260 toplam).

## R — Database integrity

`scripts/db-integrity-check.ts` genişletildi: orphan OrderItem/OrderAddressSnapshot/
OrderStatusHistory, invalid `Order.user`, negative inventory, duplicate order
number, converted-cart consistency. Çalıştırıldı: **0 bulgu**, baseline bozulmadı
(257 aktif / 260 toplam ürün).

## S — Documentation

`docs/commerce.md`: Order lifecycle, creation flow, snapshot stratejisi, Cart→Order
dönüşümü, inventory davranışı, delivery snapshot, payment status sınırı, duplicate
order koruması, gelecekteki payment entegrasyonu. `docs/security.md`: Order IDOR,
client price manipulation, duplicate submit, transaction atomicity, inventory
race condition / SQLite sınırları.

## T — Build ve regression

```
npx tsc --noEmit    → 0 hata
npm test            → 195/195 geçti (19 dosya)
npm run build       → başarılı; tüm yeni route'lar üretildi
                       (/api/orders, /api/orders/[orderNumber],
                        /api/admin/orders, /hesabim/siparislerim,
                        /siparis/[orderNumber], /admin/orders)
E2E (faz4c)         → 31/31
db-integrity        → 0 bulgu
```

## U — Git commits (5 atomik)

```
df19d04 feat(order): order schema and lifecycle
fa3eac2 feat(order): customer order creation and history
7e35322 feat(admin): order management
51239ba test(order): order unit tests, E2E and integrity checks
2160ec0 docs: order lifecycle and security
```

## V — Kesin sınırlar (bu fazda YAPILMADI)

iyzico / PayTR / Stripe / kredi kartı / banka / fatura / kargo firması API'si /
AI Garden Designer / ürün matching / marketplace-affiliate. `paymentStatus`
yalnızca manuel admin güncellemesiyle değişir.

## W — Bilinen teknik sınırlar

- **SQLite single-writer**: dağıtık concurrency garantisi yok; stok, koşullu
  `UPDATE ... WHERE quantity >= X` ile SQL düzeyinde güvenli (bu ölçekte yeterli).
  Çok-düğümlü dağıtımda Postgres + row lock gerekir (docs/security.md'de).
- **`customerNote`** alanı şemada hazır ama bu fazda doldurulmuyor (geleceğe hazır).
- **`discount`** order-seviyesi indirim her zaman 0 (ürün indirimleri final fiyata
  zaten yansıyor; checkout-seviyesi kupon gelecek faz).
- **Kargo ücreti** `DELIVERY`'de `computed:false` (gerçek kargo API'si yok).

---

**FAZ 4C TAMAMLANDI.** FAZ 4C dışında hiçbir yeni büyük faza geçilmedi. Kullanıcı
onayı bekleniyor.
