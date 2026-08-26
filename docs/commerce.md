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
