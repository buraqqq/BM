# Admin Panel — B&M Vourla FAZ 1

## Erişim

`/admin` → `/admin/products`'a yönlendirir. `middleware.ts`, `/admin/login` dışındaki tüm `/admin/*` sayfalarını oturum olmadan **erişilemez** yapar (sunucu tarafında, NextAuth JWT kontrolüyle). API tarafında da ayrıca `requireAdmin()` kontrolü vardır (defense-in-depth — yalnızca sayfa yönlendirmesine güvenilmez).

**FAZ 0'daki kritik güvenlik açığı tamamen kapatıldı:** eski `admin.html`'deki sabit şifre (`mam2026`, kaynak kodda açık) ve `localStorage.bam_auth` sahte oturumu yerine gerçek, sunucu tarafında doğrulanan, bcrypt hash'li, DB destekli oturum var (bkz. `security.md`).

## Roller

`AdminUser.role`: `SUPER_ADMIN` | `ADMIN` | `STAFF` (bkz. `src/lib/enums.ts`).

- **STAFF**: ürün/kategori/kampanya/banner okuyabilir, stok düzeltebilir. Ürün/kampanya/banner **oluşturamaz/düzenleyemez**, audit log'u **göremez**.
- **ADMIN**: STAFF + ürün/kategori/kampanya/banner CRUD, fiyat değişikliği, audit log okuma, ayar değişikliği.
- **SUPER_ADMIN**: ADMIN + (ileride) kullanıcı yönetimi gibi en hassas işlemler için ayrılmıştır.

## Ekranlar (Bölüm 8 — istenen 8 ekranın tamamı)

| Ekran | Yol | Durum |
|---|---|---|
| Products | `/admin/products` | Liste + arama/kategori/aktiflik/stok filtresi + çoklu seçim + toplu aktif/pasif; `/admin/products/new` ve `/admin/products/:id` ile oluştur/düzenle |
| Categories | `/admin/categories` | Liste + yeni kategori formu |
| Inventory | `/admin/inventory` | Arama + hızlı stok düzeltme (-1/+1/+10), her işlem `InventoryMovement` + audit log'a yazılır |
| Pricing | `/admin/pricing` | Tekil hızlı fiyat düzenleme (Bölüm 15 senaryosu) + toplu fiyat revizyonu önizleme/uygulama (Bölüm 16) |
| Campaigns | `/admin/campaigns` | Liste (şu an aktif/tarih dışı/kapalı rozetleri) + yeni kampanya formu |
| Banners | `/admin/banners` | Liste + görsel yükleme + yeni banner formu |
| Audit Log | `/admin/audit-log` | Filtrelenebilir işlem geçmişi |
| Settings | `/admin/settings` | Bize Ulaşın / marka bilgisi anahtar-değer düzenleyici |

Öncelik **işlevsellik ve güvenlik** oldu (talimat gereği); arayüz kasıtlı olarak sade tutuldu, ileri seviye dashboard/grafikler FAZ 2+'ya bırakıldı.

## Bilinen kısıtlar (bu fazda bilinçli olarak yapılmadı)

- Toplu fiyat revizyonunun UI'ı çalışır durumda ama minimaldir (yalnızca kategori bazlı; ürün çoklu-seçim ile toplu fiyat UI'ı FAZ 2 için not edildi — servis/API zaten `productIds` de destekliyor).
- Kampanyalar için ürün bazlı (PRODUCT scope) seçim UI'ı yok — API destekliyor (`productIds`), admin panel formu şu an yalnızca GLOBAL/CATEGORY sunuyor.
- Kullanıcı (admin) yönetimi ekranı yok — yeni admin eklemek için `prisma/seed-admin.ts` script'i veya doğrudan DB kullanılmalı. FAZ 2'de bir "Kullanıcılar" ekranı önerilir.
