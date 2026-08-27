# B&M Vourla — E-Ticaret & Bahçe Tasarım Platformu

B&M Vourla (Bahçe & Mangal) için tam kapsamlı **e-ticaret** ve **yapay zekâ destekli
bahçe tasarım** platformu. Tek bir Next.js uygulaması; hem müşteri mağazasını, hem
admin panelini, hem de API katmanını aynı süreçte barındırır.

## Özellikler

- **Mağaza**: ürün/kategori listeleme, arama, SEO (JSON-LD), dual PWA.
- **E-ticaret**: sepet, teslimat / mağazadan teslim seçenekli checkout, sipariş oluşturma ve geçmişi.
- **Müşteri hesabı**: kayıt / giriş, adres yönetimi, siparişlerim, stok & fiyat alarmları.
- **Admin paneli**: ürün / kategori / envanter / fiyat / kampanya / banner yönetimi, CSV import/export, sipariş yönetimi, audit log, analitik & performans kartı.
- **AI Bahçe Tasarımcısı** (`/bahce-tasarimi`): kural-tabanlı motor + canlı LLM/Vision (OpenAI / DeepSeek / Gemini / Anthropic, anahtar yoksa deterministik fallback), puzzle editörü, "nokta revize", affiliate eşleştirme.
- **Alarm & bildirim**: stok / fiyat alarmları + e-posta bildirim (CONSOLE / MOCK / RESEND adapter).
- **Cron**: `GET /api/cron/alerts` servis-token korumalı uç + Netlify Scheduled Function.

## Teknoloji

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** ORM + **PostgreSQL** (Supabase, session pooler)
- **NextAuth** (JWT — `admin` ve `customer` iki ayrı oturum tipi)
- **Zod** (sunucu tarafı doğrulama) + **Vitest** (birim testleri)

## Mimari

```
PUBLIC WEBSITE  +  ADMIN PANEL  (Next.js Server/Client Components)
        │  fetch()
        ▼
API KATMANI  (Next.js Route Handlers — src/app/api/**)
        │  Prisma Client
        ▼
DATABASE  (PostgreSQL — Supabase)
```

**Kurallar:**
- Frontend veritabanına **asla doğrudan bağlanmaz** — yalnızca `/api/*` uçlarına `fetch()` atar.
- **Saf iş mantığı** `src/lib/*.ts` içinde (DB'siz, birim testli); DB I/O route'larda ince katman.
- Fiyat motoru (`computeFinalPrice`) tek kaynak; teslimat tipi tek alan (`deliveryMethod`).
- Kaynak kodda sabit (hardcoded) sır yoktur — tamamı `process.env.*` üzerinden okunur.

## Klasör yapısı

```
bm-vourla-app/
├── prisma/            — schema, migration, seed'ler
├── src/
│   ├── app/           — sayfalar (mağaza + admin) ve API route'ları
│   ├── components/    — UI bileşenleri
│   ├── lib/           — saf iş mantığı, Prisma client, auth, pricing, alert/email servisleri
│   └── middleware.ts  — /admin/* oturum koruması
├── docs/              — detaylı referans dokümantasyon
├── netlify/           — Netlify Scheduled Function (alarm cron)
└── .env.example
```

## Kurulum

1. **Node.js 18+** kurulu olmalı.
2. `npm install`
3. `.env.example` → `.env` olarak kopyala ve `DATABASE_URL`'i doldur
   (Supabase PostgreSQL, session pooler):
   ```
   DATABASE_URL="postgresql://postgres.<REF>:<SIFRE>@aws-0-<BOLGE>.pooler.supabase.com:5432/postgres"
   ```
4. `npx prisma migrate deploy`
5. Seed (idempotent, sırasıyla):
   ```
   npm run seed
   npm run seed:admin
   npx tsx prisma/seed-garden-categories.ts
   npx tsx prisma/seed-garden-products.ts
   ```
6. `npm run dev` → `http://localhost:3000` (admin paneli: `/admin`)

## Test & doğrulama

```
npm test           # Vitest birim testleri
npx tsc --noEmit   # tip kontrolü
npm run build      # production build
```

## Deploy

Bkz. `DEPLOYMENT.md` — Netlify/Vercel adımları, cron yapılandırması, güvenlik kontrol listesi.

## Dokümantasyon

- `DEPLOYMENT.md` — deploy / cron / güvenlik rehberi
- `DEVAM_DURUMU.md` — proje durumu (handoff)
- `docs/` — API, güvenlik, veritabanı, katalog vb. detaylı referanslar
