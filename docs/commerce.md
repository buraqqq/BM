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
