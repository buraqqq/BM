# Stok Yönetimi (FAZ 2)

## "Doğrulanmamış" stok kavramı (Bölüm 18/32/45 — kritik)

FAZ 1'in migrasyon kaynağı (`products.js`) hiç stok verisi tutmuyordu. FAZ 1 migrasyonu her ürüne **varsayımsal bir başlangıç miktarı** atadı ve bunu `InventoryMovement` tablosunda `type: "MIGRATION"` olarak işaretledi. FAZ 2, bu sayıları **gerçek stokmuş gibi göstermez**.

Kural (hesaplama-zamanlı, yeni bir DB kolonu **eklenmeden**): bir ürünün stoğu **"doğrulanmamış"** sayılır **ancak ve ancak** o ürünün hiçbir `InventoryMovement` kaydı `MIGRATION` dışında bir tipte değilse. Yani admin en az bir kez gerçek bir hareket (giriş, satış, sayım, düzeltme...) girdiği anda o ürün "doğrulanmış" sayılır — ayrı bir "verified" bayrağı tutulmasına gerek kalmaz, gerçek kaynak veri (`InventoryMovement` geçmişi) tek doğruluk kaynağıdır.

Bu mantık `src/lib/inventory-summary.ts` (`getInventorySummary()`) içinde tek yerde hesaplanır ve hem `/admin/inventory` hem `/admin/dashboard` bunu kullanır — iki yerde ayrı ayrı (ve potansiyel olarak birbirinden sapan) hesaplama yok.

**Görünürlük**: `unverifiedInventoryCount > 0` olduğu sürece hem `/admin/dashboard` hem `/admin/inventory` üstünde **kapatılamaz** bir "⚠ Legacy stoklar doğrulanmayı bekliyor" bandı gösterilir (Bölüm 45'in açık gereksinimi). `/admin/inventory` listesinde doğrulanmamış satırlar ayrıca görsel olarak işaretlenir (`.unverified-row` + "Bekliyor" rozeti).

## Stok durumu türetme (Bölüm 21)

`src/lib/stock-status.ts` → `deriveStockStatus(quantity, lowStockThreshold)`:

- `quantity <= 0` → `OUT_OF_STOCK`
- `quantity <= lowStockThreshold` → `LOW_STOCK`
- aksi halde → `IN_STOCK`

Bu fonksiyon **beş** çağrı noktasında kullanılır (ürün oluşturma, delta güncelleme, sayım modu, CSV import CREATE, CSV import UPDATE) — hepsi aynı tek kaynaktan besleniyor. FAZ 2 sırasında yapılan bir E2E doğrulamasında (bkz. tamamlanma raporu, Bölüm O), ürün oluşturma ucunun bu hesaplamayı hiç yapmadığı ve 0 stokla oluşturulan ürünlerin yanlışlıkla `IN_STOCK` göründüğü bulunup düzeltildi.

## Stok hareketleri (Bölüm 19)

`PATCH /api/admin/inventory/:productId` — `{quantity: <delta>, type, reason}`. `quantity` burada **delta**'dır (ör. `-3` = 3 satıldı). Sonuç negatife düşerse `400 NEGATIVE_STOCK` — stok asla negatife inemez.

Hareket nedenleri (`InventoryMovementType`): `RESTOCK` (satın alma), `SALE` (satış), `RETURN` (iade), `DAMAGE` (hasar), `WASTE` (fire), `COUNT_ADJUSTMENT` (sayım — yalnızca sayım ucu üretir), `ADJUSTMENT` (manuel düzeltme), `MIGRATION` (yalnızca FAZ 1 migrasyonunda kullanıldı, admin panelinden seçilemez/üretilmez), `OTHER`.

Her hareket: kullanıcı (`createdByAdminId`), miktar değişimi, önceki→sonraki stok (`resultingQuantity`), neden, tarih — kaydedilir ve ayrıca `INVENTORY_UPDATE` olarak audit log'a yazılır.

## Stok sayım modu (Bölüm 20)

`PATCH /api/admin/inventory/:productId/count` — `{countedQuantity, reason}`. `countedQuantity`, delta değil, fiziksel sayımın **mutlak sonucudur**. Fark (`diff = countedQuantity - previousQuantity`) hesaplanır, `InventoryMovement` **`COUNT_ADJUSTMENT`** tipiyle hem önceki hem sonraki miktarla kaydedilir, `INVENTORY_COUNT` olarak audit log'a yazılır. `/admin/inventory`'deki "Sayım Modu" paneli: sistem stoğu vs. girilecek fiziksel sayım, canlı fark gösterimi, "[ SAYIMI ONAYLA ]".

## Düşük stok / tükenen ürün (Bölüm 21)

`Inventory.lowStockThreshold` (varsayılan 5, ürün bazında değiştirilebilir). `/admin/inventory` ve `/admin/dashboard`'da gerçek DB'den hesaplanmış "Az Stok" ve "Tükenen Ürün" sayaçları (`getInventorySummary()`), yalnızca **aktif** ürünler sayılır.

## Transaction güvenliği (Bölüm 37)

Hem delta güncelleme hem sayım modu, `Inventory.update` + `InventoryMovement.create` çiftini tek bir `$transaction` içinde uygular — ikisinden biri başarısız olursa hiçbiri uygulanmaz, stok tablosu ile hareket geçmişi asla birbirinden sapmaz.
