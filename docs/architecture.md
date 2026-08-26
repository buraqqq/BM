# Mimari — B&M Vourla FAZ 1

Bu doküman, FAZ 1 sonunda **gerçekten var olan** mimariyi anlatır. Henüz yapılmamış hiçbir şey burada "yapılmış" gibi sunulmaz; gelecek fazlara ait planlar `future-ai-architecture.md` ve bu dosyanın sonundaki "Genişletme noktaları" bölümünde ayrıca işaretlenmiştir.

## Katmanlar

```
PUBLIC WEBSITE (Next.js Server/Client Components)
        │  fetch()
        ▼
APPLICATION / API LAYER (Next.js Route Handlers, /src/app/api/**)
        │  Prisma Client
        ▼
DATABASE (SQLite — prisma/dev.db)
        ▲
        │  Prisma Client (aynı API katmanı üzerinden)
ADMIN PANEL (Next.js — /src/app/admin/**, aynı Next.js süreci)
```

Tek bir Next.js uygulaması hem **public web sitesini**, hem **admin panelini**, hem de **API katmanını** barındırır — üçü de aynı süreçte, aynı Prisma Client'ı, aynı veritabanını paylaşır. Bu, FAZ 0 talimatındaki "gelecekte Market PWA + AI Garden Designer PWA + Admin Panel + Public Website aynı backend'i paylaşsın, gereksiz ayrı backend'ler kurulmasın" hedefine uygun kurulmuştur: FAZ 2+'da yeni bir PWA eklendiğinde, o da bu API katmanını (`/api/products`, `/api/categories`, vb.) tüketecek — ayrı bir backend süreci gerekmeyecek.

**Önemli mimari kural — frontend veritabanına asla doğrudan bağlanmaz.** Public sayfa (`src/app/page.tsx`) bile, aynı süreçte çalışan Prisma Client'ı doğrudan import edip kullanabilecekken, bilinçli olarak bunu yapmaz; kendi `/api/products`, `/api/categories`, `/api/banners`, `/api/campaigns`, `/api/settings` uçlarına `fetch()` ile istek atar (bkz. `src/lib/api-base.ts`). Bunun nedeni, gelecekte ayrı bir Market PWA veya Garden Designer PWA eklendiğinde bu API'lerin zaten "dışarıdan tüketilebilir" olarak tasarlanmış olmasıdır.

## Neden bu teknoloji seçimi

FAZ 0 audit'i mevcut projenin **tamamen statik** (framework yok, build sistemi yok, hosting/deployment konfigürasyonu yok) olduğunu tespit etmişti. Bu, "mevcut deployment imkanlarını dikkate alarak" bir seçim yapılmasını zorlaştırıyordu çünkü değerlendirilecek bir deployment altyapısı yoktu. Bu belirsizlik kritik bir karar noktasıydı (bkz. FAZ 0 talimatının 32. maddesi: "kritik belirsizlik varsa raporla, en güvenli seçeneği belirle, kendi içinde ilerle") — bu yüzden en taşınabilir, en az varsayım gerektiren seçenekler tercih edildi:

| Katman | Seçim | Gerekçe |
|---|---|---|
| Frontend + Backend | **Next.js 14 (App Router, TypeScript)** | Tek framework hem sayfaları hem API route'larını üretir; SSR ile SEO sorunu da (FAZ 0 bulgusu) çözülür; Vercel'den kendi sunucunuza kadar hemen her ortamda çalışır. |
| Veritabanı | **SQLite** (dosya tabanlı) | Sıfır dış altyapı gerektirir — mevcut projenin "hiç sunucu/hosting altyapısı yok" durumuyla uyumlu en güvenli varsayılan. **Kritik not:** SQLite dosyası kalıcı disk ister; Vercel gibi serverless bir platforma deploy edilecekse (kalıcı disk sunmaz) `DATABASE_URL` tek satırla hosted Postgres (Neon/Supabase) veya libSQL/Turso'ya çevrilmelidir — Prisma bu geçişi şema değişikliği gerektirmeden destekler. Bkz. `database.md`. |
| ORM | **Prisma** | Migration sistemi (Bölüm 23), tip güvenliği, SQLite→Postgres geçişinde şema taşınabilirliği. |
| Authentication | **NextAuth.js (Credentials + JWT)** | Server-side, bcrypt hash'li, DB destekli — FAZ 0'daki client-side sahte auth'un tam karşıtı. |
| Validation | **Zod** | Her admin write-endpoint'inde çalışır; frontend'den gelen hiçbir veri güvenilmez (Bölüm 21). |
| Storage | **Yerel dosya sistemi (public/uploads/)**, S3'e geçişe hazır arayüz | Şu an için ek bir bulut hesabı gerektirmez; `src/lib/storage.ts` S3 sürücüsü eklenene kadar tek nokta. |
| Deployment | **Standart Node.js süreci** (`next build && next start`) | Herhangi bir Node hosting'de (VPS, PaaS) çalışır; belirli bir sağlayıcıya kilitlenmez. |

## Fiyat/Kampanya mimarisi — "otomatik başlangıç/bitiş" nasıl çalışıyor

Cron/scheduler kurulmadı. Bunun yerine **her okuma anında türetilen (derived) aktiflik** kullanılıyor:

```
isCurrentlyActive = isActive AND startDate <= now <= endDate
```

Bkz. `src/lib/date-range-active.ts` (Banner ve Campaign için ortak, test edilmiş saf fonksiyon) ve `src/lib/pricing.ts`. Bu yaklaşım FAZ 1 ölçeğinde (küçük işletme, düşük trafik) bir cron job'dan daha basit, daha az hataya açık ve "tarih geldiğinde otomatik" gereksinimini tam karşılıyor çünkü her istek güncel durumu hesaplıyor — hiçbir arka plan görevi başarısız olup senkron dışı kalamaz.

## Klasör yapısı (gerçek)

```
bm-vourla-app/
├── prisma/
│   ├── schema.prisma          — veritabanı şeması
│   ├── seed.ts                 — 257 ürün migrasyonu (bkz. migration.md)
│   ├── seed-admin.ts           — ilk admin kullanıcısını oluşturur
│   └── legacy/products.legacy.js — eski products.js'in birebir kopyası (migrasyon kaynağı)
├── src/
│   ├── app/
│   │   ├── page.tsx             — public ana sayfa (Bölüm 19)
│   │   ├── globals.css          — eski style.css temel alınarak taşındı
│   │   ├── api/                 — Bölüm 18 API katmanı (public + admin)
│   │   └── admin/                — Bölüm 8 admin panel sayfaları
│   ├── components/               — SiteHeader, CategoryGrid, ProductForm, AdminNav, ...
│   ├── lib/                      — prisma client, auth, pricing, storage, validation, audit, rate-limit, enums
│   └── middleware.ts             — /admin/* için oturum zorunluluğu
├── docs/                         — bu klasör
├── scripts/verify-e2e.sh          — Bölüm 29 uçtan uca doğrulama script'i
└── .env.example
```

## Genişletme noktaları (FAZ 2+ için hazır bırakıldı, henüz uygulanmadı)

- `User` / `Address` modelleri var ama hiçbir müşteri-facing özellik bunlara bağlı değil (e-ticaret FAZ 2+).
- `src/lib/storage.ts` içinde `STORAGE_DRIVER=s3` dalı tanımlı ama implemente edilmedi.
- AI mimarisi ve Garden Designer akışı için `future-ai-architecture.md`.
