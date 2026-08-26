# FAZ 4A — Tamamlanma Raporu
**Customer Account + Cart Foundation**
Tarih: 2026-08-26

Kapsam talimatına sadık kalındı: **yeni büyük özellik geliştirilmedi** (checkout/ödeme/sipariş yok), **mevcut storefront/pricing/admin mimarisi yeniden yazılmadı** — hepsi genişletildi/yeniden kullanıldı.

---

## A — Customer authentication

Mevcut NextAuth altyapısına (`src/lib/auth.ts`), admin akışının (`credentials`) yanına **ikinci** bir `CredentialsProvider` (`customer-credentials`) eklendi — ayrı bir authentication mekanizması icat edilmedi. `User` modeli + bcrypt (cost 12) ile doğrulanıyor. Oturum artık `session.user.kind: "admin" | "customer"` ile ayrışıyor. Kayıt/giriş/çıkış/profil görüntüleme/güncelleme/şifre değiştirme uçtan uca gerçek HTTP istekleriyle test edildi (bkz. F/Q).

## B — Registration

`POST /api/account/register`: name, surname, email, phone, password. E-posta normalize+lowercase+unique (409 `EMAIL_TAKEN` varsa), şifre bcrypt (cost 12) ile hash'lenir, düz metin hiçbir yerde tutulmaz. Server-side Zod validation (`customer-validation.ts`) + minimum şifre gücü kontrolü (`customer-auth.ts`: en az 8 karakter, en az 1 harf + 1 rakam).

## C — Profile

`/hesabim`: ad, soyad, email, telefon, hesap oluşturma tarihi görüntüleme + güncelleme. Email değişikliğinde uniqueness kontrolü (409) + NextAuth'un standart `trigger:"update"` mekanizmasıyla JWT'nin session claim'i senkronize edilir (ayrı bir senkron sistemi icat edilmedi).

## D — Password security

Mevcut şifre `bcrypt.compare` ile doğrulanır, yeni şifre bcrypt (cost 12) ile yeniden hash'lenir. **Bilinen sınır** (dokümante edildi, `docs/security.md`): şifre değişikliğinde mevcut açık oturumlar anında iptal edilmiyor — JWT (session store'suz) stratejisi doğası gereği doğal süresinde (8 saat) sona eriyor; ayrı bir session-invalidation mekanizması bu fazda bilinçli olarak eklenmedi.

## E — Address system

FAZ1'den beri şemada duran ama **0 satırlı, hiç kullanılmayan** `Address` modeli, Türkiye adres yapısına uygun alanlarla (title, firstName, lastName, phone, city, district, neighborhood, addressLine, postalCode, country, isDefault) yeniden tanımlandı — ayrı bir `CustomerAddress` modeli değil (veri kaybı yok, migration öncesi 0 satır doğrulandı). Sistem yalnızca İzmir'e kilitlenmedi (city/district serbest metin). CRUD + varsayılan adres seçimi tam çalışıyor; "aynı anda yalnızca 1 isDefault" invariant'ı **server-side, transaction içinde** garanti ediliyor (`src/lib/address-rules.ts` saf karar mantığı + `$transaction`). İlk adres otomatik varsayılan olur; varsayılan silinirse kalan en yeni adres otomatik terfi eder.

## F — Address authorization

Her `/api/account/addresses/:id` isteği önce adresi id'ye göre bulur, SONRA `userId` sahipliğini kontrol eder — eşleşmezse (adres hiç yoksa da, BAŞKASINA aitse de) **AYNI 404 NOT_FOUND** döner (403 değil — var/yok bilgisi sızdırılmaz). Gerçek ikinci bir kullanıcı (User B) ile GET/PATCH/DELETE denemeleri `scripts/faz4a-commerce-e2e-check.ts`'te otomatik test edildi: **tüm denemeler 404 ile reddedildi, hedef adres hiçbir şekilde değişmedi/silinmedi.**

## G — Guest cart

Mevcut `Cart`/`CartItem` şeması (FAZ3) kullanıldı — yeni bir sepet sistemi kurulmadı. Misafir kimliği `HttpOnly + secure + SameSite=Lax` bir cookie'de (`bm_guest_cart`, `crypto.randomUUID()` — yeni bağımlılık eklenmedi) taşınır; gerçek kaynak her zaman DB'deki `Cart` satırıdır, `localStorage` tek başına source of truth olarak KULLANILMADI.

## H — Authenticated cart

`GET /api/cart` hem misafir hem kimliği doğrulanmış istekte AYNI uçtur — kimliği doğrulanmış kullanıcı için sepet `Cart.userId` üzerinden bulunur/oluşturulur, istemci tarafında dallanma gerekmez.

## I — Cart merge

Login sonrası istemci `POST /api/cart/merge`'i çağırır. Guest sepeti + kullanıcının mevcut sepeti birleştirilir: aynı üründe miktarlar toplanır, **stok limitini aşmaz** (`src/lib/cart-logic.ts` `mergeCartItems`, saf/DB'siz karar mantığı — birim testli), birleşen satırlar için `computeFinalPrice` yeniden çağrılıp fiyat tazelenir, guest `Cart` silinir ve cookie temizlenir — tamamı **tek transaction** içinde. E2E'de gerçek HTTP ile doğrulandı: guest sepetteki ürün, login sonrası merge çağrısıyla kullanıcı sepetine taşındı.

## J — Price snapshot

Sepete eklenirken `CartItem.unitPriceAtAdd`, mevcut pricing engine'in `computeFinalPrice()` fonksiyonuyla hesaplanır — **fiyat hesaplama mantığı ikinci kez yazılmadı**, doğrudan çağrıldı (aynı fonksiyon storefront listeleme ve FAZ3.1 price-sort'ta kullanılan).

## K — Price revalidation

`GET /api/cart` her satır için GÜNCEL final fiyatı yeniden hesaplar, `unitPriceAtAdd` ile karşılaştırır (`priceChanged`) — hiçbir şey sessizce üzerine yazılmaz, `/sepet` sayfası eski/yeni fiyatı açıkça gösterir. E2E'de gerçek bir fiyat değişikliği (admin tarafından `price` güncellendi) sonrası `priceChanged:true` ve doğru yeni fiyat doğrulandı.

## L — Stock validation

Sepete ekleme/güncelleme sırasında (mevcut sepet miktarı + eklenecek miktar) stoğu aşarsa **409 ile reddedilir** — sessizce kısılmaz. **SEPETE EKLEME STOK REZERVASYONU DEĞİLDİR**: `Inventory.quantity` hiçbir şekilde değiştirilmez, `InventoryMovement` OLUŞTURULMAZ. `GET /api/cart` ayrıca stok sonradan azaldıysa `stockExceeded` uyarısı gösterir. E2E'de stok=2 olan bir üründe: 2'ye kadar kabul, 5'e çıkarma denemesi 409 ile reddedildi.

## M — Cart UI

`/sepet`: ürün görseli, isim, SKU, birim fiyat, miktar (+/-), satır toplamı, stok/fiyat değişikliği/satıştan kalkma uyarıları, sepet toplamı — hem guest hem authenticated. Empty state ("Sepetiniz boş." + "Ürünleri Keşfet") ve header'da adet rozetli sepet ikonu (`CartBadge`, guest dahil çalışıyor) eklendi.

## N — Mobile UX

Mevcut `MobileTabBar` (4 sekme: Ana Sayfa/Ürünler/Ara/WhatsApp) **korunarak**, WhatsApp sekmesi kaldırılmadan bir "Sepet" sekmesi eklendi (5 sekme, flex tabanlı düzen sabit sütun sayısı gerektirmiyordu). Miktar +/- kontrolleri ve dokunma hedefleri mevcut 44px minimum kuralına uyuyor (globals.css genel kural zaten kapsıyor).

## O — Security

- İki oturum türü kesin ayrık: bir admin oturumuyla `/api/account/*`/`/api/cart/*`'a, bir customer oturumuyla `/api/admin/*`'a erişim mümkün değil (manuel + otomatik test edildi).
- IDOR savunması hem adres hem cart item için aynı desen (404, var/yok ayrımı yok) — E2E'de doğrulandı.
- Brute-force koruması (mevcut `LoginAttempt` tablosu) customer login'e de genişletildi, yeni tablo/servis eklenmedi.
- Login'de genel hata mesajı (kullanıcı var/yok sızdırılmaz), kayıtta ise (farklı tehdit modeli) 409 açıkça döner.
- Tüm mutation endpoint'leri server-side Zod validation kullanıyor.
- Yeni harici servis (Redis, S3, ödeme sağlayıcı) EKLENMEDİ.

## P — Tests

`npm test -- --run`: **160/160 geçti** (108 → 160, +52 yeni test). Yeni testler: `customer-auth.test.ts` (9), `address-rules.test.ts` (9), `cart-logic.test.ts` (21), `customer-validation.test.ts` (13) — Bölüm 33'teki 26 senaryonun saf-mantık kısmı burada kapsanıyor (Test 1/2/7/8/10/14/17/19/20/21/22/24/25 doğrudan veya dolaylı). DB/HTTP gerektiren senaryolar (Test 3/4/5/6/9/11/12/13/15/16/18/23/26) `scripts/faz4a-commerce-e2e-check.ts`'te gerçek sunucuya karşı doğrulandı.

## Q — E2E

`scripts/faz4a-commerce-e2e-check.ts`, gerçek çalışan dev server'a karşı, cookie-jar tabanlı gerçek NextAuth login/logout akışıyla **43/43 assertion başarılı**: guest add/update/remove/re-add → kayıt → duplicate email → login success/failure → guest→user merge → adres CRUD + default invariant + IDOR (User B) → logout/login sepet kalıcılığı → admin fiyat değişikliği revalidation → admin arşivleme revalidation → şifre değiştirme (eski şifre çalışmıyor, yeni çalışıyor) → oturumsuz erişim reddi → cart ownership IDOR. Sonunda oluşturduğu her şeyi (2 User, 3 Product, adresler, sepetler, login denemeleri) siliyor.

## R — Database integrity

Son kontrol (`scripts/db-integrity-check.ts`, User/Address/Cart/CartItem taramaları için genişletildi):
- **257 aktif ürün, 260 toplam (3 arşiv)** ✅ beklenenle birebir
- **0 orphan, 0 duplicate** (User.email dahil) ✅
- Kullanıcı başına en fazla 1 default adres invariant'ı ayrıca doğrulandı ✅
- Tüm test verisi (2 User, 3 Product, adresler, sepetler, login kayıtları) **tamamen temizlendi**, kalıcı iz yok.

## S — Build

`npx tsc --noEmit`: temiz (0 hata).
`npm run build`: başarılı — yeni tüm route'lar (`/api/account/*`, `/api/cart/*`, `/giris`, `/kayit`, `/hesabim`, `/hesabim/adresler`, `/sepet`) derlendi.

## T — Documentation

`docs/commerce.md`: guest cart, authenticated cart, cart merge, price snapshot, price/stock/isActive revalidation, checkout sınırı (Order/Payment/Shipping hâlâ yok) bölümleri eklendi.
`docs/security.md`: iki oturum türü ayrımı, IDOR savunma deseni, customer rate-limit, guest cart cookie güvenliği, bilinen sınırlar bölümü eklendi.

## U — Git commits

5 anlamlı commit:
1. `feat(auth): customer registration and account`
2. `feat(account): address management`
3. `feat(cart): guest and authenticated cart`
4. `test(cart): customer commerce foundation E2E + integrity check`
5. `docs: FAZ 4A commerce + security documentation`

Şema migration'ı hariç (User.surname + Address yeniden tanımı, 0 veri kaybı) hiçbir mevcut model/route/component yeniden yazılmadı — yalnızca genişletildi.

## V — Known limitations

- **Şifre değişikliğinde session invalidation yok**: mevcut açık oturumlar doğal JWT süresinde (8 saat) sona eriyor, anında iptal edilmiyor (bkz. D).
- **Admin/customer ortak session maxAge (8 saat)**: müşteri için daha uzun bir "beni hatırla" süresi düşünülebilir, bu fazda NextAuth'un tek global `session.maxAge`'i admin ile paylaşıldı — over-engineering'den kaçınmak için ayrı bir per-provider süre mekanizması kurulmadı.
- **Customer aksiyonları admin AuditLog'una yazılmıyor**: `AuditLog` tablosu FAZ1'den beri "admin işlemleri" için dokümante edilmiş; müşteri login/register/cart aksiyonları için ayrı bir audit sistemi bu fazda bilinçli olarak eklenmedi (brute-force koruması `LoginAttempt` üzerinden yine de tam çalışıyor).
- **Cart total, satıştan kalkmış ürünleri toplama dahil etmiyor**: `/sepet` sayfası pasif ürünleri gösterir ama `subtotal` yalnızca hâlâ satışta olan satırlardan hesaplanır (checkout olmadığı için şimdilik yalnızca görüntü amaçlı bir karar).
- **Rate limit / abuse**: yeni harici servis (Redis vb.) eklenmedi, mevcut DB tabanlı `LoginAttempt` mekanizması hem admin hem customer için kullanılıyor; cart mutation endpoint'leri için AYRI bir rate-limit eklenmedi (gereksinimde "future-ready abstraction" istenmişti — mevcut `isLoginRateLimited` deseni doğrudan uygulanabilir örnek olarak dokümante edildi, cart endpoint'lerine bağlanmadı çünkü gerçek bir kötüye kullanım paterni henüz gözlemlenmedi).
- **Checkout/ödeme/sipariş/kargo/Gel-Al/fatura**: kesinlikle eklenmedi (talimat gereği). `Cart.status="CONVERTED"` hâlâ yalnızca yer tutucu.

---

## FAZ 4B'YE GEÇİLMEDİ

Kullanıcı onayı bekleniyor.
