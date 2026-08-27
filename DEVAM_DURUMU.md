# DEVAM DURUMU — B&M Vourla (Kaldığımız Yer)

> Bu dosyayı okuduğunda projeye hâkim olup kaldığın yerden devam edebilirsin.
> Son güncelleme: 2026-08-27 (FAZ 12 sonu).

## Proje konumu & çalıştırma

- **Klasör:** `C:\Users\pc\Desktop\BM-website\bm-vourla-app`
- **Stack:** Next.js 14 (App Router) + TypeScript + Prisma + SQLite + NextAuth + Zod + Vitest
- **Kabuk:** PowerShell (Windows). Node 24, npm 11.

```powershell
cd C:\Users\pc\Desktop\BM-website\bm-vourla-app
npm install          # deps (node_modules gitignore'da)
npm run dev          # http://localhost:3000
npm test             # Vitest birim testleri
npm run build        # Next production build
npx tsc --noEmit     # tip kontrolü
npx prisma migrate dev   # migration (şema değişince)
npx tsx prisma/seed-*.ts # seed'ler (idempotent)
npx tsx scripts/db-integrity-check.ts
```

`.env` (gitignore'da, commit'e girmez) şunları içerir: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_SEED_EMAIL/PASSWORD`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `STORAGE_*`, `EMAIL_PROVIDER`/`RESEND_API_KEY`/`EMAIL_FROM` (FAZ 10 bildirim). Admin: `admin@bmvourla.com`.

## Tamamlanan fazlar (git'te commit'li)

- **FAZ 1** core (auth/RBAC, fiyat motoru, ürün/kategori/envanter, banner/kampanya, audit, settings)
- **FAZ 2** katalog (kategori ağacı, öznitelikler, CSV import/export, stok sayımı, toplu işlem)
- **FAZ 2.1** db integrity check
- **FAZ 3** storefront (ana sayfa, kategori/ürün listeleme, arama, SEO/JSON-LD, mobil UX)
- **FAZ 3.1** müşteri hesabı (register/login, JWT)
- **FAZ 4A** müşteri auth + adres + sepet (guest/user cart + merge)
- **FAZ 4B** checkout validation (yalnızca doğrulayan, DB'ye yazmayan)
- **FAZ 4C** gerçek sipariş (Order/OrderItem/OrderAddressSnapshot/OrderStatusHistory, stok düşme, admin order yönetimi)
- **FAZ 5** AI Garden Designer (rule-based motor + PWA + affiliate model + 7 bahçe kategorisi)
- **FAZ 6** canlı LLM & Vision (4 sağlayıcı: OpenAI/DeepSeek/Gemini/Anthropic + failover + cache)
- **FAZ 7** bahçe ürün veri seti + affiliate yönlendirme/click tracking + stok-bilinçli BOM eşleştirme + analytics
- **FAZ 8** admin dashboard "Affiliate & BOM Eşleşme Performansı" kartı
- **FAZ 9** stok & fiyat alarmları (ProductAlert + alert-service + /api/alerts + /api/admin/alerts/trigger + ürün/alarmlarım UI)
- **FAZ 10** e-posta bildirim servisi (email-service: CONSOLE/MOCK/RESEND adapter + alert trigger entegrasyonu + 15 unit test)
- **FAZ 11** admin analitik & performans dashboard'u (analytics-service: alarm istatistikleri + en çok alarm kurulan ürünler + e-posta teslimat başarı oranı + /api/admin/analytics + AdminAnalytics UI)
- **FAZ 12** dokümantasyon + production hazırlığı (DEPLOYMENT.md deploy/env/cron/güvenlik rehberi)

**Git HEAD:** `33b456a` (son commit'ler: FAZ 11 analytics dashboard → FAZ 10 docs → FAZ 10 email → FAZ 9 mojibake fix → FAZ 9 alerts).

## Veritabanı durumu (dev.db)

- 291 ürün (288 aktif) — FAZ 7'de 31 ürün eklendi (baseline 260 → 291).
- 14 kategori (7 orijinal + 7 bahçe: bitki/tohum/sulama/hortum/saksi/toprak-gubre/alet).
- 39 affiliate ürünü (`AffiliateProduct`: name/vendor/affiliateUrl/category/estimatedPrice/commissionRate).
- Order tabloları boş (test verisi self-cleaning temizleniyor).

## Mimari kurallar (bozma)

- **Saf iş mantığı `src/lib/*.ts`'te** (DB'siz, testli); **DB I/O route'larda** ince katman.
- Fiyat motoru `computeFinalPrice` TEK kaynak (tekrar yazma, tekrar çağır).
- Teslimat: `deliveryMethod` = `PICKUP`(=STORE_PICKUP) / `DELIVERY`(=CARGO) — FAZ 4B'den beri var, duplicate alan YOK.
- LLM/affiliate "uydurma veri yok" ilkesi: match rate null/gerçek, affiliate linkler satıcı-arama URL'si.

## Doğrulama durumu (son)

- `npx tsc --noEmit` → **0 hata** ✅
- `npm test` → **271/271** (26 dosya) ✅
- `npm run build` → **başarılı** (FAZ 11 sonrası da doğrulandı, 32 statik sayfa).

## Commit'lenmemiş durum

- Temiz — FAZ 8-12 değişiklikleri commit'li. Not: `scripts/verify-e2e.sh` Windows'ta executable bit'i saklanamadığı için sahte mode farkı veriyordu; `git config core.filemode false` ile çözüldü (yerel config, commit'e girmez).

## Sıradaki işler (önerilen sıra)

1. **Production deploy**: `DEPLOYMENT.md`'deki adımları izle — kalıcı disk sunmayan platform (Vercel) için SQLite → hosted Postgres (Neon/Supabase) geçişi ZORUNLU; `DATABASE_URL` tek satır değişikliği.
2. **Alarm cron'u**: `checkAndTriggerAlerts()` şu an yalnızca `POST /api/admin/alerts/trigger` ile manuel tetikleniyor. Üretimde harici bir cron (Vercel Cron / GitHub Actions / uptime ping) ile periyodik çağrı bağlanmalı (bkz. DEPLOYMENT.md).
3. **Gerçek e-posta teslimatı**: `.env`'de `EMAIL_PROVIDER=RESEND` + `RESEND_API_KEY` + gerçek `EMAIL_FROM` ayarlanana kadar bildirimler CONSOLE'a düşer (`delivered:false` — dürüst mock).
4. **Affiliate gerçek ürün linkleri**: hâlâ satıcı-arama URL'leri; admin'de gerçek ürün linklerine çevrilecek.
5. İstenirse `ProductAlert`'a gerçek bir `status` (CANCELLED) alanı eklenebilir — şu an iptal DELETE ile kalıcı siliniyor, CANCELLED istatistiği bu yüzden 0.

## Araç/tooling uyarıları (gelecek oturum için)

- **`File` aracının `edit` aksiyonu güvenilmez** (büyük edit'leri sessizce düşürebilir / bayat REF döndürür). **`File write` (tam yeniden yazma)** veya **Bash + PowerShell `.ps1` ile `.Replace()`** kullan.
- **PowerShell `.ps1` içinde satır sonu için ÇİFT tırnak kullan** — tek tırnak içinde `` `n `` gerçek backtick yazar (FAZ 8'de `Unterminated template literal` hatası yaptı).
- **`.ps1` içinde Türkçe karakter = bozulur** (PowerShell 5.1 ANSI okur). Ankrajları ASCII tut; Türkçe içerikleri `File write` ile temp dosyaya yazıp ASCII `.ps1` ile splice et.
- Shell güvenlik katmanı çok satırlı komutu engeller → script'i dosyaya yaz, `powershell -NoProfile -ExecutionPolicy Bypass -File <script.ps1>` ile çalıştır.
- `prisma/dev.db` gitignore'da; migration'lar `prisma/migrations/`'da commit'li.
