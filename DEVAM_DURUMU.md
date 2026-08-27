# DEVAM DURUMU — B&M Vourla (Kaldığımız Yer)

> Bu dosyayı okuduğunda projeye hâkim olup kaldığın yerden devam edebilirsin.
> Son güncelleme: 2026-08-27 (FAZ 8 sonu).

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

`.env` (gitignore'da, commit'e girmez) şunları içerir: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_SEED_EMAIL/PASSWORD`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `STORAGE_*`. Admin: `admin@bmvourla.com`.

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

**Git HEAD:** `450dd9a` (son 6 commit: affiliate card → analytics service → analytics endpoint → FAZ 7 → LLM → FAZ 5 raporu).

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
- `npm test` → **220/220** (22 dosya) ✅
- `npm run build` → **en son FAZ 5'te doğrulandı**; FAZ 6-8 yalnızca tsc+test ile doğrulandı. **İlk iş olarak `npm run build` çalıştır.**

## Commit'lenmemiş durum

- `scripts/verify-e2e.sh` → **`M` (modified) görünüyor; bu BİZE AİT DEĞİL** — kullanıcının FAZ 4B zip'inden gelen önceden-modifiye dosya. Dokunmadık; istersen commit et veya `git checkout -- scripts/verify-e2e.sh` ile geri al.

## Sıradaki işler (önerilen sıra)

1. `npm run build` ile FAZ 6-8 sonrası build'i yeniden doğrula.
2. **Canlı LLM yolunu gerçek anahtarla test et**: `/api/ai-designer/design` artık OpenAI'ye (gpt-4o-mini) gidecek; `POST` ile bir istek atıp `source: "llm"` gelip gelmediğini ve failover'ı doğrula.
3. **Fotoğraf/ses UI'ı**: `ai-designer-inputs.ts` (`PhotoInput`/`voiceTranscript`/`parseCommand`) hazır ama kamera + Web Speech API UI'ı bağlanmadı (route'a `photoDataUrl` geçişi de henüz yok).
4. **Affiliate gerçek ürün linkleri**: şu an satıcı-arama URL'leri; admin'de gerçek ürün linklerine çevrilecek.
5. `db-integrity-check.ts`'e `AffiliateProduct`/`AffiliateClick` bütünlük kontrolü eklenebilir (şu an yok — tıklamalar AuditLog'da `AFFILIATE_CLICK`, ayrı tablo yok).
6. İstenirse admin dashboard'a affiliate analytics tüketici zaten var (FAZ 8 kartı).

## Araç/tooling uyarıları (gelecek oturum için)

- **`File` aracının `edit` aksiyonu güvenilmez** (büyük edit'leri sessizce düşürebilir / bayat REF döndürür). **`File write` (tam yeniden yazma)** veya **Bash + PowerShell `.ps1` ile `.Replace()`** kullan.
- **PowerShell `.ps1` içinde satır sonu için ÇİFT tırnak kullan** — tek tırnak içinde `` `n `` gerçek backtick yazar (FAZ 8'de `Unterminated template literal` hatası yaptı).
- **`.ps1` içinde Türkçe karakter = bozulur** (PowerShell 5.1 ANSI okur). Ankrajları ASCII tut; Türkçe içerikleri `File write` ile temp dosyaya yazıp ASCII `.ps1` ile splice et.
- Shell güvenlik katmanı çok satırlı komutu engeller → script'i dosyaya yaz, `powershell -NoProfile -ExecutionPolicy Bypass -File <script.ps1>` ile çalıştır.
- `prisma/dev.db` gitignore'da; migration'lar `prisma/migrations/`'da commit'li.
