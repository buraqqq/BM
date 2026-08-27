# DEPLOYMENT — B&M Vourla (Production Hazırlık Rehberi)

> Son güncelleme: 2026-08-27 (FAZ 12).
> Bu doküman, projeyi canlı ortama taşımak için gereken adımları, çevre
> değişkenlerini, cron yapılandırmasını ve güvenlik önlemlerini tek yerde toplar.

## 1. Mimari özet

- **Stack:** Next.js 14 (App Router) + TypeScript + Prisma + NextAuth + Zod + Vitest.
- **Veritabanı:** SQLite (geliştirme). Production için kalıcı disk sunmayan
  platformlarda **hosted Postgres'e geçiş ZORUNLUDUR** (bkz. Bölüm 2).
- **Auth:** NextAuth JWT (httpOnly cookie), `kind: "admin" | "customer"` iki oturum türü.
- **E-posta:** Provider/Adapter mimarisi (`EMAIL_PROVIDER`): `CONSOLE` / `MOCK` / `RESEND`.
- **Alarm tetikleme:** `checkAndTriggerAlerts()` — manuel endpoint (`POST /api/admin/alerts/trigger`)
  veya harici cron ile çağrılır (bkz. Bölüm 5).

---

## 2. Veritabanı: Supabase PostgreSQL (FAZ 14'te geçiş TAMAMLANDI)

SQLite'tan hosted PostgreSQL'e geçiş yapıldı. Aktif yapılandırma:

- **Provider:** `postgresql` (`prisma/schema.prisma`).
- **Bağlantı:** Supabase **session pooler** (IPv4, port 5432):
  ```
  postgresql://postgres.<PROJE_REF>:<DB_SIFRE>@aws-0-<BOLGE>.pooler.supabase.com:5432/postgres
  ```
  - Bölge: `eu-central-1` (Frankfurt) → host `aws-0-eu-central-1.pooler.supabase.com`.
  - ⚠️ Supabase **direkt** bağlantısı (`db.<ref>.supabase.co:5432`) bu projede IPv6-only
    çözümlendiği için kullanılamaz — **pooler** kullanın.
- **Migration:** `prisma/migrations/` altında TEK baseline migration
  (`20260828000000_init`, PostgreSQL). Uygulama: `npx prisma migrate deploy`.
- **Seed (idempotent, sırasıyla):** `seed.ts` → `seed-admin.ts` →
  `seed-garden-categories.ts` → `seed-garden-products.ts` → `seed-affiliate.ts` →
  `seed-affiliate-extra.ts`.

> Not: Tüm "enum" alanlar bilinçli olarak `String` tutulur. PostgreSQL'de gerçek enum'a
> çevirmek isteğe bağlıdır (zorunlu değil). Şemanın geri kalanı değişmeden çalışır.

---

## 3. Çevre değişkenleri (`.env`)

Tam liste ve açıklamalar `.env.example` içindedir. Production için kritik olanlar:

| Değişken | Zorunlu | Not |
|---|---|---|
| `DATABASE_URL` | ✅ | Production: hosted Postgres bağlantı dizesi |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32` ile üret; **dev ile asla aynı olmasın** |
| `NEXTAUTH_URL` | ✅ | Deploy domain'i (ör. `https://bmvourla.com`) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Server component'lerin kendi API'sine fetch taban URL'i |
| `NODE_ENV` | ✅ | `production` |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | Yalnızca ilk kurulum | Seed sonrası sil; admin şifresini panelden değiştir |
| `LOGIN_MAX_ATTEMPTS` | Hayır (varsayılan 5) | Brute-force penceresi |
| `LOGIN_WINDOW_MINUTES` | Hayır (varsayılan 15) | Brute-force pencere süresi |
| `STORAGE_DRIVER` | Hayır (`local`) | S3 için `s3` + `S3_*` değişkenleri |
| `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Hayır | Canlı LLM/Vision (anahtar yoksa rule-based fallback) |
| `EMAIL_PROVIDER` | Hayır (`CONSOLE`) | `CONSOLE` \| `MOCK` \| `RESEND` |
| `RESEND_API_KEY` | Yalnızca `EMAIL_PROVIDER=RESEND` | Resend API anahtarı |
| `EMAIL_FROM` | Yalnızca RESEND | Doğrulanmış gönderici adresi (ör. `noreply@bmvourla.com`) |
| `CRON_SECRET` | Yalnızca cron | Harici cron servislerinin `/api/cron/alerts` ucunu çağırabilmesi için (bkz. Bölüm 5) |

> `NEXT_PUBLIC_` öneki olmayan hiçbir değişken tarayıcıya sızmaz (Next.js kuralı).
> Sırları dağıtım platformunun kendi secret yönetimine girin; `.env` dosyasını
> sunucuya taşımayın.

---

## 4. Build & çalıştırma

```bash
npm install
npm run build     # Next production build
npm run start     # next start -p 3000
```

Vercel'de: framework "Next.js" otomatik algılanır; build command `npm run build`,
output varsayılandır. Tek ek gereksinim hosted Postgres (Bölüm 2).

### Netlify

Netlify'da build `netlify.toml` (kök dizinde) ile yönetilir — dosya zaten repo'da
hazırdır ve şunu yapar:

- **Build command:** `npx prisma generate && npx prisma migrate deploy && npm run build`
  (Prisma client üret → migration uygula → Next.js build).
- **Publish:** `.next` — `@netlify/plugin-nextjs` eklentisiyle birlikte.

Netlify'a özel adımlar:

1. **Veritabanı:** Netlify kalıcı disk sunmadığı için SQLite **kesinlikle çalışmaz**.
   Deploy'dan önce `prisma/schema.prisma` → `provider = "postgresql"`, `DATABASE_URL`
   = hosted Postgres (Neon/Supabase) — bkz. Bölüm 2.
2. **Env vars:** Netlify UI → Site settings → Environment variables. En az
   `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`,
   `NODE_ENV=production` ekle. E-posta için `EMAIL_PROVIDER`/`RESEND_API_KEY`/
   `EMAIL_FROM` (Bölüm 6).
3. **Build command doğrulaması:** `netlify.toml`'daki `[build]` zaten doğru;
   ayrıca Netlify UI'da override etme.
4. **İlk seed:** Migration'lar `prisma migrate deploy` ile otomatik uygulanır,
   ancak seed verisi (admin kullanıcısı + ürünler) deploy'da otomatik ÇALIŞMAZ.
   İlk deploy sonrası bir defaya mahsus yerel ortamda (Postgres'e `DATABASE_URL`
   bağlıyken) `npx tsx prisma/seed-admin.ts` ve `npx tsx prisma/seed-garden-products.ts`
   çalıştır — ya da bunu tek seferlik bir build adımına ekle.
5. **Scheduled Functions (alarm cron'u):** `checkAndTriggerAlerts()`'i periyodik
   tetiklemek için Netlify Scheduled Functions kullan. `netlify.toml`'a:
   ```toml
   [functions."alerts-trigger"]
     schedule = "*/15 * * * *"
   ```
   > Dikkat: `POST /api/admin/alerts/trigger` `requireAdmin` korumalıdır. Scheduled
   > Function bu uca kimlik doğrulamalı istek atamaz — ya endpoint'e ayrı bir
   > servis-token mekanizması eklenmeli (bu FAZ'da yok) ya da scheduled function
   > `checkAndTriggerAlerts()`'i doğrudan içe aktarıp çağırmalıdır (serverless
   > function bağlamında `prisma` çalışır). İkincisi önerilen yoldur.

---

## 5. Cron: Alarm tetikleme

`checkAndTriggerAlerts()` bekleyen stok/fiyat alarmlarını tarar, tetiklenenlere
e-posta gönderir ve sonucu AuditLog'a yazar. **Uygulama içinde gerçek bir
scheduler YOK** — tetikleme şu yollarla yapılır:

- **Manuel (admin):** `POST /api/admin/alerts/trigger` (admin oturumu gerekli).
- **Cron (servis-token korumalı):** `GET /api/cron/alerts` — harici cron
  servisleri bu uca `Authorization: Bearer <CRON_SECRET>` başlığıyla istek atar.
  `CRON_SECRET` env'i ayarlanmadıysa uç 503 döner (fail-closed). Doğrulama
  `crypto.timingSafeEqual` ile yapılır (bkz. `src/lib/cron-auth.ts`).

Kurulum (önerilen: Netlify Scheduled Function):

- Repo'daki `netlify/functions/alerts-trigger.mjs` her 15 dakikada bir
  `/api/cron/alerts` ucunu otomatik çağırır. Netlify UI → Environment variables
  bölümüne `CRON_SECRET` ekleyin (ör. `openssl rand -base64 32`).
- Alternatif (GitHub Actions / cron-job.org / uptime-ping):
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/alerts
  ```

Önerilen cadans: 15 dakikada bir (stok/fiyat değişimi bildirimleri için makul).

---

## 6. E-posta (Resend) kurulumu

1. Resend hesabı aç, alan adını doğrula (domain doğrulaması).
2. `.env`'e:
   ```
   EMAIL_PROVIDER=RESEND
   RESEND_API_KEY=<api-key>
   EMAIL_FROM=noreply@bmvourla.com
   ```
3. `EMAIL_PROVIDER` yoksa/`CONSOLE` ise e-postalar stdout'a yazılır ve
   `delivered:false` loglanır (gerçek teslimat iddiası yok — dürüst davranış).
   `RESEND` + 2xx yanıt → `delivered:true`.

---

## 7. Güvenlik kontrol listesi (deploy öncesi)

- [ ] `NEXTAUTH_SECRET` dev'den farklı, güçlü bir değer.
- [ ] `NODE_ENV=production`, `NEXTAUTH_URL` gerçek domain.
- [ ] `DATABASE_URL` hosted Postgres (SQLite DEĞİL, serverless için).
- [ ] `ADMIN_SEED_PASSWORD` seed sonrası değiştirildi / `.env`'den silindi.
- [ ] `.env` git'e girmedi (`.gitignore` doğrulandı).
- [ ] Brute-force: `LOGIN_MAX_ATTEMPTS`/`LOGIN_WINDOW_MINUTES` uygun (varsayılan 5/15).
- [ ] HTTP başlıkları aktif (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
      `Permissions-Policy` — `next.config.js`).
- [ ] E-posta: `EMAIL_FROM` doğrulanmış gönderici adresi.
- [ ] Migration'lar `prisma migrate deploy` ile uygulandı (elle SQL yok).

**Bilinen sınır (CSP):** Content-Security-Policy başlığı henüz eklenmedi —
Font Awesome / Google Fonts harici kaynakları nedeniyle dikkatli bir politika
gerekir; ayrı bir iterasyon olarak önerilir (bkz. `docs/security.md`).

---

## 8. Rollback / sır rotasyonu

- `NEXTAUTH_SECRET` değişirse tüm aktif oturumlar geçersiz olur (JWT imzası) —
  beklenen ve güvenli davranıştır.
- Migration rollback: Prisma Migrate `--create-only` ile manuel down-migration
  üretilir; doğrudan geriye `migrate deploy` yoktur — yeni bir migration ile
  düzeltme yapılır.
- `.env` yanlışlıkla commit edilirse: `NEXTAUTH_SECRET` + `ADMIN_SEED_PASSWORD`
  derhal değiştirilir; git geçmişinden temizlik (`git filter-repo`) ayrı işlemdir.
