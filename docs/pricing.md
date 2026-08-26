# Fiyatlandırma (FAZ 2)

## Tekil ürün fiyatı (Bölüm 12)

Ürün formunun "Fiyat" sekmesinde: maliyet fiyatı, satış fiyatı, karşılaştırma fiyatı, manuel indirim (`salePrice`), KDV. Marj (`(satış - maliyet) / satış × 100`) admin tarafında hesaplanıp gösterilir; `costPrice` **hiçbir zaman** public API yanıtlarına (`serializePublicProduct`) dahil edilmez ve CSV export'unda yalnızca `ADMIN`/`SUPER_ADMIN` erişebilir (bkz. `security.md`).

## Toplu fiyat motoru (Bölüm 13-15)

`POST /api/admin/products/bulk-price`, ADMIN+.

**Kapsam** (en az biri zorunlu — hiçbiri verilmezse "tümü" anlamına **gelmez**, kazara toplu işlemi önlemek için `allProducts:true` açıkça gönderilmeli):

| Alan | Anlamı |
|---|---|
| `allProducts: true` | Tüm ürünler |
| `categoryId` | Kategori + **tüm alt ağacı** (`getCategorySubtreeIds`) |
| `brandId` | Marka |
| `productIds` | Seçili ürünler veya admin UI'da filtre sonucu donmuş id listesi |

**İşlem** (`adjustment.type`): `PERCENT_INCREASE`, `PERCENT_DECREASE`, `FIXED_INCREASE`, `FIXED_DECREASE`, `SET_PRICE` (belirli fiyata getir). Hesaplama `applyBulkAdjustment()` (`src/lib/pricing.ts`, birim testli) — sonuç her zaman 2 ondalığa yuvarlanır, hiçbir zaman negatif olamaz (0'da sınırlanır).

**Önizleme zorunlu** (Bölüm 14): aynı uç `dryRun: true` ile çağrılırsa hiçbir yazma yapmadan `{affectedCount, preview: [{id, name, oldPrice, newPrice}, ...]}` döner (ilk 200 satır gösterilir). Admin UI, kullanıcı "Uygula" demeden **asla** `dryRun: false` göndermez. FILTERED kapsamda (arama/filtre sonucu), önizleme ile uygulama arasında veri değişirse farklı bir küme etkilenmesin diye, filtre sonucu ürün id listesi önizlemeden **önce** tam olarak (sayfalanarak) çekilip donuyor; hem önizleme hem uygulama bu dondurulmuş listeyi kullanır.

`dryRun: false` çağrısı: tüm ürün güncellemeleri + her biri için bir `PriceHistory` satırı **tek bir `$transaction`** içinde uygulanır (Bölüm 37 — yarım kalan toplu güncelleme DB'yi tutarsız bırakmaz), ardından `BULK_PRICE_UPDATE` audit log'a yazılır (kim, kaç ürün, hangi işlem/değer, hangi kapsam).

## Price History (Bölüm 15)

Her fiyat değişikliği (tekil PUT, tekil PATCH, toplu revizyon, CSV import) bir `PriceHistory` satırı bırakır: `field`, `oldValue`, `newValue`, `reason` (`"manual"` | `"bulk:<tip>:<değer>"` | `"csv-import"` | `"create"`), `changedById`. Admin ürün detayında geçmiş görülebilir.

## Kampanya çakışma kontrolü (Bölüm 16-17)

Bir ürün aynı anda GLOBAL, CATEGORY (+alt ağaç) ve PRODUCT kapsamlı birden fazla aktif kampanyanın içinde bulunabilir; ayrıca üründe manuel bir `salePrice` de olabilir. `computeFinalPrice()` kuralı: **en düşük fiyat kazanır** (kampanya vs. manuel indirim karşılaştırılır), sonuç asla `basePrice`'ın üzerine çıkmaz. Bu, iki farklı/belirsiz fiyat üretilmesini mimari olarak imkânsız kılar — tek bir `finalPrice` her zaman hesaplanır.

Bu kararın **neden** öyle olduğunu admin'e göstermek için `GET /api/admin/products/:id/price-explain` → `explainPriceDecision()` tüm aday indirimleri (`PriceDecisionCandidate[]`) ve hangisinin kazandığını döner. `/admin/campaigns` ekranındaki "Fiyat Çakışma Kontrolü" paneli bir ürün aratıp bu listeyi gösterir: her adayın kaynağı (kampanya adı veya "manuel indirim"), sonuç fiyatı, kazanan aday yeşil + "✓ Kazandı" rozetiyle, diğerleri "Uygulanmadı" ile işaretlenir.

## Kampanya UI — ürün seçimi (Bölüm 16)

`/admin/campaigns`: kampanya kapsamı artık `GLOBAL` | `CATEGORY` | `PRODUCT`. `PRODUCT` kapsamında, oluşturma formunda arama + çoklu seçim + seçimi temizle vardır; kampanya listesindeki her PRODUCT-kapsamlı satırda ayrıca genişleyebilir bir "Ürünleri Yönet" paneli var — mevcut ürünleri listeler (kaldır butonu) ve arama-ile-ekle sunar (`PATCH /api/admin/campaigns/:id { add, remove }`, `CAMPAIGN_PRODUCT_ASSIGN` olarak audit loglanır).
