# Admin Panel — B&M Vourla FAZ 1

## Erişim

`/admin` → `/admin/products`'a yönlendirir. `middleware.ts`, `/admin/login` dışındaki tüm `/admin/*` sayfalarını oturum olmadan **erişilemez** yapar (sunucu tarafında, NextAuth JWT kontrolüyle). API tarafında da ayrıca `requireAdmin()` kontrolü vardır (defense-in-depth — yalnızca sayfa yönlendirmesine güvenilmez).

**FAZ 0'daki kritik güvenlik açığı tamamen kapatıldı:** eski `admin.html`'deki sabit şifre (`mam2026`, kaynak kodda açık) ve `localStorage.bam_auth` sahte oturumu yerine gerçek, sunucu tarafında doğrulanan, bcrypt hash'li, DB destekli oturum var (bkz. `security.md`).

## Roller

`AdminUser.role`: `SUPER_ADMIN` | `ADMIN` | `STAFF` (bkz. `src/lib/enums.ts`).

- **STAFF**: ürün/kategori/marka/kampanya/banner okuyabilir, stok düzeltebilir (delta) ve stok sayımı yapabilir (Bölüm 20). Ürün/kategori/marka/kampanya/banner **oluşturamaz/düzenleyemez**, toplu fiyat/toplu ürün işlemi/CSV içe-dışa aktarma **yapamaz**, audit log'u **göremez**.
- **ADMIN**: STAFF + ürün/kategori/marka/kampanya/banner/attribute CRUD, tekil ve toplu fiyat değişikliği, kampanya ürün ataması, ürün toplu işlemleri, CSV içe/dışa aktarma, audit log okuma, ayar değişikliği.
- **SUPER_ADMIN**: ADMIN + hard-delete girişimlerini engelleyen uçlara erişim (bunlar zaten herkese 405 döner) ve (ileride) kullanıcı yönetimi gibi en hassas işlemler için ayrılmıştır.

Tam uç-bazlı rol matrisi için bkz. `api.md`.

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

FAZ 1'de öncelik **işlevsellik ve güvenlik** oldu; ileri seviye dashboard/grafikler FAZ 2'ye bırakılmıştı.

## FAZ 2'de eklenen ekranlar

| Ekran | Yol | Açıklama |
|---|---|---|
| Panel (Dashboard) | `/admin/dashboard` | `/admin`'in artık yönlendirdiği ana sayfa; gerçek DB istatistikleri + kapatılamaz "doğrulanmayı bekleyen stok" bandı (Bölüm 31/38/45, bkz. `inventory.md`) |
| Markalar | `/admin/brands` | Bölüm 6 — marka CRUD |
| Özellikler | `/admin/attributes` | Bölüm 10 — dinamik ürün özellik tanımları |
| İçe/Dışa Aktar | `/admin/import-export` | Bölüm 23-26 — CSV akışı (bkz. `import-export.md`) |

FAZ 1'in "Bilinen kısıtlar" bölümünde listelenen üç madde FAZ 2'de çözüldü:

- ✅ Toplu fiyat revizyonu artık tam kapsam matrisi (tümü/kategori+alt ağaç/marka/seçili/filtre sonucu) + zorunlu önizleme sunuyor (bkz. `pricing.md`).
- ✅ Kampanyalar için PRODUCT kapsamlı ürün seçim UI'ı eklendi (arama + çoklu seçim + "Ürünleri Yönet" paneli).
- Kullanıcı (admin) yönetimi ekranı **hâlâ yok** — bu FAZ 2 kapsamına alınmadı (spesifikasyonda yer almıyordu), FAZ 3+ için not edilir. Yeni admin eklemek için hâlâ `prisma/seed-admin.ts` veya doğrudan DB gerekir.
