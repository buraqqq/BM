# API — B&M Vourla (FAZ 1 + FAZ 2)

Tüm uçlar Next.js Route Handler'ları (`src/app/api/**/route.ts`). Base URL: dağıtım domain'iniz (yerelde `http://localhost:3000`).

Kimlik doğrulama: NextAuth session cookie (httpOnly). Admin uçları `requireAdmin(minRole)` ile korunur (`src/lib/require-admin.ts`) — oturum yoksa **401**, rol yetersizse **403**. Roller: `STAFF` < `ADMIN` < `SUPER_ADMIN` (bkz. `admin.md`/`security.md`).

## Public uçlar (auth gerekmez)

| Uç | Açıklama |
|---|---|
| `GET /api/products` | `?category=&search=&featured=1&page=&pageSize=` — yalnızca `isActive=true`, fiyat aktif kampanyalar dahil hesaplanmış olarak döner |
| `GET /api/products/:slug` | Tek ürün; pasifse veya yoksa 404. FAZ 2: yanıt artık `seoTitle`/`seoDescription` de içerir |
| `GET /api/categories` | Aktif kategoriler + ürün sayısı + FAZ 2: `parentId`/`depth`/`path` alanları |
| `GET /api/banners` | Yalnızca **şu an** tarih aralığında ve aktif olan bannerlar |
| `GET /api/campaigns` | Yalnızca şu an aktif kampanyalar |
| `GET /api/settings` | Yalnızca `contact_`, `site_`, `whatsapp_`, `footer_` önekli ayarlar (whitelist) |

### FAZ 2 — public sayfalar (API değil, ama yeni URL'ler)

`/urun/:slug` ve `/kategori/:slug` — bkz. `catalog.md`. Ayrı bir API ucu eklemiyor, mevcut `/api/products/:slug` ve `/api/categories`'i server component içinde tüketiyor.

## Auth

| Uç | Açıklama |
|---|---|
| `GET/POST /api/auth/*` | NextAuth (`/api/auth/csrf`, `/api/auth/callback/credentials`, `/api/auth/signout`, ...) |
| `GET /api/admin/me` | Oturum açmış admin'in bilgisi (401 açık değilse) |

## Admin uçları — Ürün / Kategori / Marka

| Uç | Metod | Min. rol | Açıklama |
|---|---|---|---|
| `/api/admin/products` | GET | STAFF+ | Arama (isim/SKU/barkod)/kategori(+alt ağaç)/marka/aktiflik/stok/fiyat aralığı filtreleri + server-side pagination (Bölüm 10/35) |
| `/api/admin/products` | POST | ADMIN+ | Ürün oluştur; `duplicateWarnings` döner (Bölüm 9/27) |
| `/api/admin/products/:id` | GET | STAFF+ | Ürün detay |
| `/api/admin/products/:id` | PUT | ADMIN+ | Tam güncelleme (costPrice dahil tüm alanlar); fiyat değişirse otomatik `PriceHistory` + audit log |
| `/api/admin/products/:id` | PATCH | ADMIN+ | Kısmi güncelleme: `{isActive,reason}` → archive/restore, veya `{price,compareAtPrice,salePrice,reason}` → **yalnız fiyat** (costPrice PATCH'te YOK, bkz. `pricing.md`) |
| `/api/admin/products/:id` | DELETE | SUPER_ADMIN | **Her zaman 405** — hard delete kapalı |
| `/api/admin/products/:id/images` | GET/POST | STAFF+/ADMIN+ | Galeri listesi / yeni görsel ekleme |
| `/api/admin/products/:id/images/:imageId` | PATCH | ADMIN+ | `{altText,isPrimary,isMobilePrimary,sortOrder}` — ana/mobil-ana değişimi audit loglanır |
| `/api/admin/products/:id/images/:imageId` | DELETE | ADMIN+ | Hard delete (galeri öğesi); audit loglanır |
| `/api/admin/products/:id/price-explain` | GET | STAFF+ | Bölüm 17 — kampanya çakışma açıklaması (bkz. `pricing.md`) |
| `/api/admin/products/:id/variants` | GET/POST | STAFF+/ADMIN+ | FAZ 1'den |
| `/api/admin/products/:id/variants/:variantId` | PATCH | ADMIN+ | FAZ 1'den |
| `/api/admin/products/bulk-action` | POST | ADMIN+ | Bölüm 22 — `{productIds, action, categoryId?, brandId?, campaignId?}` (bkz. `product-management.md`) |
| `/api/admin/products/bulk-price` | POST | ADMIN+ | Bölüm 13-15 — `{allProducts\|categoryId\|brandId\|productIds, adjustment:{type,value}, dryRun}` (bkz. `pricing.md`) |
| `/api/admin/products/export` | GET | **ADMIN+** | CSV export, maliyet fiyatı içerdiği için STAFF'a kapalı (bkz. `import-export.md`) |
| `/api/admin/categories` | GET/POST | STAFF+/ADMIN+ | |
| `/api/admin/categories/:id` | GET/PUT | STAFF+/ADMIN+ | PUT: SEO/görsel/sıralama dahil tam güncelleme |
| `/api/admin/categories/:id` | PATCH | ADMIN+ | Kısmi güncelleme — parent değiştirme (`moveCategory`, materialized path yeniden hesaplanır) dahil |
| `/api/admin/categories/:id` | DELETE | SUPER_ADMIN | **Her zaman 405** — hard delete kapalı |
| `/api/admin/brands` | GET/POST | STAFF+/ADMIN+ | Bölüm 6 |
| `/api/admin/brands/:id` | PUT | ADMIN+ | |
| `/api/admin/brands/:id` | DELETE | SUPER_ADMIN | **Her zaman 405** |
| `/api/admin/attribute-definitions` | GET/POST | STAFF+/ADMIN+ | Bölüm 10 — dinamik ürün özellikleri |
| `/api/admin/attribute-definitions/:id` | PUT | ADMIN+ | |
| `/api/admin/attribute-definitions/:id` | DELETE | SUPER_ADMIN | **Her zaman 405** |

## Admin uçları — Stok / Fiyat / Kampanya

| Uç | Metod | Min. rol | Açıklama |
|---|---|---|---|
| `/api/admin/inventory` | GET | STAFF+ | Arama + filtre + özet (`getInventorySummary()`) |
| `/api/admin/inventory/:productId` | PATCH | **STAFF+** | Bölüm 19 — `{quantity: <delta>, type, reason}`, sonuç negatifse `400` |
| `/api/admin/inventory/:productId/count` | PATCH | **STAFF+** | Bölüm 20 — `{countedQuantity, reason}` (mutlak sayım) |
| `/api/admin/campaigns` | GET/POST | STAFF+/ADMIN+ | POST artık `scope: PRODUCT` için `productIds` de kabul eder |
| `/api/admin/campaigns/:id` | GET/PUT | STAFF+/ADMIN+ | |
| `/api/admin/campaigns/:id` | PATCH | ADMIN+ | Bölüm 16 — `{add:[], remove:[]}` PRODUCT kapsamlı kampanyaya ürün ekle/çıkar |
| `/api/admin/banners` | GET/POST | STAFF+/ADMIN+ | |
| `/api/admin/banners/:id` | PUT | ADMIN+ | |

## Admin uçları — İçe/Dışa Aktarma

| Uç | Metod | Min. rol | Açıklama |
|---|---|---|---|
| `/api/admin/import/preview` | POST | ADMIN+ | `{rows, columnMapping}` — dry-run, hiçbir yazma yapmaz |
| `/api/admin/import/commit` | POST | ADMIN+ | Aynı validasyon + gerçek uygulama, 100'lük batch transaction'lar (bkz. `import-export.md`) |

## Admin uçları — Yönetim

| Uç | Metod | Min. rol | Açıklama |
|---|---|---|---|
| `/api/admin/dashboard` | GET | STAFF+ | Bölüm 31/38/45 — gerçek DB'den hesaplanmış ürün/stok/kampanya/banner/katalog istatistikleri |
| `/api/admin/audit-log` | GET | ADMIN+ | `?entity=&action=&page=` |
| `/api/admin/settings` | GET/PUT | STAFF+/ADMIN+ | |
| `/api/admin/upload` | POST | ADMIN+ | `multipart/form-data`: `file`, `category` (products/banners/garden/ai-generated) |

## Validation (Bölüm 18/21)

Her admin write-endpoint'i `src/lib/validation.ts` içindeki bir Zod şemasından geçer. Geçersiz istek her zaman `400 { error: "VALIDATION_ERROR", details }` döner — hiçbir zaman sunucu hatasına (500) veya sessiz kabul etmeye düşmez. Frontend'den (admin panel dahil) gelen hiçbir veri güvenilir kabul edilmez.

## Hata biçimi

```json
{ "error": "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "NEGATIVE_STOCK" | "HARD_DELETE_DISABLED" | "RATE_LIMITED",
  "message": "insan-okunur açıklama",
  "details": { /* yalnızca VALIDATION_ERROR'da, zod .flatten() çıktısı */ } }
```

## Fiyat nesnesi (public ürün yanıtlarında)

```json
{
  "price": {
    "base": 1500,
    "final": 1200,
    "compareAt": 1500,
    "discountSource": "campaign" | "sale" | "none",
    "discountPercent": 20,
    "campaign": { "id": "...", "name": "...", "discountType": "PERCENTAGE", "discountValue": 20 } | null
  }
}
```

`costPrice` bu nesnede **hiçbir zaman** yer almaz — yalnızca admin uçlarında (`GET/PUT /api/admin/products/:id`, export) döner ve export'ta rol STAFF'a kapalıdır (bkz. `security.md`).
