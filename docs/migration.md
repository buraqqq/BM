# Migration — 257 Ürün (Bölüm 6)

## Kaynak

`prisma/legacy/products.legacy.js` — eski repodaki `products.js`'in **birebir kopyası** (izlenebilirlik için repoda saklanıyor, canlı sistemde kullanılmıyor). Migration script'i: `prisma/seed.ts`. Çalıştırma: `npm run seed`.

## 254 vs 257 tutarsızlığının çözümü

FAZ 0 audit'i, arayüzde "254 çeşit ürün" yazarken kod içindeki gerçek dizi uzunluğunun **257** olduğunu tespit etmişti (kategori yorumunda "Mangal, Malzemeleri & Termal Servis" için 66 yazıyordu, gerçekte 69 ürün vardı). Migration script'i bu sayıyı **koddan değil, gerçek diziden** sayarak DB'ye yazdı:

```
Toplam işlenen kayıt: 257 / 257
Sorunlu (inactive işaretlenen) kayıt: 0
```

Public ana sayfa artık `"{toplam} Çeşit Ürün – {kategori sayısı} Kategori"` başlığını **veritabanından canlı olarak** (`GET /api/products` → `total`, `GET /api/categories` → `items.length`) hesaplıyor — bu sayı bir daha asla koddan drift edemez, çünkü artık kodda hiç yazılı değil.

## Doğrulama/temizlik kuralları nasıl uygulandı

Script her ürün için: isim boş mu, fiyat sayısal formatta mı (`^\d+(\.\d+)?$`), aynı kategori içinde tekrarlayan isim var mı, birim tanınıyor mu — kontrol etti. **Hiçbir sorunlu kayıt bulunmadı** (bkz. `prisma/legacy/migration-report.json`, `flaggedCount: 0`). Böyle bir kayıt bulunsaydı: **silinmezdi**, `isActive=false` ile pasif yazılırdı ve nedeni hem `AuditLog` (`entity: "Migration"`) hem de `migration-report.json` dosyasına kaydedilirdi — bu mekanizma koda gömülü ve test edilmiştir, yalnızca bu migrasyonda tetiklenecek bir durum çıkmadı.

## Normalize edilen alanlar

| Eski (products.js) | Yeni (DB) |
|---|---|
| `price: "550"` (string) | `price: Decimal(550)` |
| `unit: "TL/kg"` (serbest metin, fiyatla karışık) | `unit: "KG"` (enum) — eşleme tablosu: `src/lib/enums.ts` → `LEGACY_UNIT_TO_ENUM` (10 farklı birim tespit edildi ve haritalandı: kg, tane, set, L, şişe, paket, çift, 100gr, m², mt) |
| yok | `sku: "BM-BAHARAT-001"` gibi otomatik üretildi (kategori + sıra no) |
| yok | `slug` (Türkçe karakter dönüşümlü, benzersiz) |
| kategori string id (`"baharat"`) | `Category.slug = "baharat"` üzerinden gerçek FK ilişkisi |
| yok | `legacySourceId` (ör. `"baharat-0"`) — hangi eski kaydın hangi yeni kayda karşılık geldiği her zaman izlenebilir |

## Stok verisi — önemli caveat

**Legacy products.js hiçbir zaman stok bilgisi tutmuyordu** (FAZ 0 audit bulgusu: "Stok: Yok"). Migration script'i bu nedenle gerçek bir sayım **icat etmedi**; her ürüne güvenli bir varsayılan başlangıç miktarı (50 adet/kg) atadı ve bunu **açıkça bir `InventoryMovement` kaydında** belirtti:

> "Migrasyon: legacy products.js hiç stok verisi tutmuyordu. Varsayılan başlangıç miktarı atandı, gerçek sayım gerekiyor."

**Aksiyon gerekiyor:** İşletme sahibinin gerçek stok sayımını admin panelinin "Stok" ekranından (`/admin/inventory`) girmesi önerilir. Bu, rapordaki "Bilinen eksikler" listesinde de ayrıca vurgulanmıştır.

## Site ayarları (Bize Ulaşın)

Adres, telefon, WhatsApp, çalışma saatleri, Instagram, e-posta bilgileri artık koda gömülü değil — `Setting` tablosunda (12 anahtar), `/admin/settings` ekranından düzenlenebilir. Değerler eski `index.html`'den **birebir** taşındı (marka bilgisi değişmedi, yalnızca yönetilebilir hale geldi).

## Sonuç doğrulaması

```
products: 257 (aktif), 3 (FAZ 1 test verisi, archive edilmiş — bkz. FAZ1 sonu raporu Bölüm Q)
categories: 7
settings: 12
```
