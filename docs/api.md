# API — B&M Vourla FAZ 1

Tüm uçlar Next.js Route Handler'ları (`src/app/api/**/route.ts`). Base URL: dağıtım domain'iniz (yerelde `http://localhost:3000`).

Kimlik doğrulama: NextAuth session cookie (httpOnly). Admin uçları `requireAdmin()` ile korunur (`src/lib/require-admin.ts`) — oturum yoksa **401**, rol yetersizse **403**.

## Public uçlar (auth gerekmez)

| Uç | Açıklama |
|---|---|
| `GET /api/products` | `?category=&search=&featured=1&page=&pageSize=` — yalnızca `isActive=true`, fiyat aktif kampanyalar dahil hesaplanmış olarak döner |
| `GET /api/products/:slug` | Tek ürün; pasifse veya yoksa 404 |
| `GET /api/categories` | Aktif kategoriler + ürün sayısı |
| `GET /api/banners` | Yalnızca **şu an** tarih aralığında ve aktif olan bannerlar |
| `GET /api/campaigns` | Yalnızca şu an aktif kampanyalar |
| `GET /api/settings` | Yalnızca `contact_`, `site_`, `whatsapp_`, `footer_` önekli ayarlar (whitelist) |

## Auth

| Uç | Açıklama |
|---|---|
| `GET/POST /api/auth/*` | NextAuth (`/api/auth/csrf`, `/api/auth/callback/credentials`, `/api/auth/signout`, ...) |
| `GET /api/admin/me` | Oturum açmış admin'in bilgisi (401 açık değilse) |

## Admin uçları (oturum + rol zorunlu)

| Uç | Metod | Min. rol | Açıklama |
|---|---|---|---|
| `/api/admin/products` | GET | STAFF+ | Arama/kategori/aktiflik/stok/fiyat aralığı filtreleri (Bölüm 10) |
| `/api/admin/products` | POST | ADMIN+ | Ürün oluştur (Bölüm 9) |
| `/api/admin/products/:id` | GET | STAFF+ | Ürün detay |
| `/api/admin/products/:id` | PUT | ADMIN+ | Tam güncelleme; fiyat değişirse otomatik `PriceHistory` + audit log |
| `/api/admin/products/:id` | PATCH | ADMIN+ | Kısmi güncelleme: `{isActive}` → archive/restore, veya `{price,...}` → yalnız fiyat (Bölüm 15) |
| `/api/admin/products/:id` | DELETE | SUPER_ADMIN | **Her zaman 405** — hard delete kapalı, mesaj PATCH `isActive=false`'a yönlendirir |
| `/api/admin/products/bulk-price` | POST | ADMIN+ | Bölüm 16 — `{categoryId\|subcategoryId\|productIds, adjustment:{type,value}, dryRun}` |
| `/api/admin/categories` | GET/POST | STAFF+/ADMIN+ | |
| `/api/admin/categories/:id` | PUT | ADMIN+ | |
| `/api/admin/campaigns` | GET/POST | STAFF+/ADMIN+ | Bölüm 12 |
| `/api/admin/campaigns/:id` | PUT | ADMIN+ | |
| `/api/admin/banners` | GET/POST | STAFF+/ADMIN+ | Bölüm 13 |
| `/api/admin/banners/:id` | PUT | ADMIN+ | |
| `/api/admin/inventory/:productId` | PATCH | STAFF+ | `{quantity: <delta>, type, reason}` — sonuç negatifse 400 |
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
