# Environment & Secrets — B&M Vourla FAZ 1

## Dosyalar

| Dosya | Git'te mi? | Amaç |
|---|---|---|
| `.env.example` | ✅ Evet | Gerekli tüm değişkenlerin listesi + açıklaması, gerçek değer yok |
| `.env` | ❌ Hayır (`.gitignore`) | Gerçek geliştirme sırları (DB yolu, NextAuth secret, seed admin şifresi) |
| `.env.production` (önerilir, henüz yok) | ❌ Hayır | Üretim sırları — dağıtım platformunun kendi secret yönetimine (Vercel/host env vars) girilmesi önerilir, dosya olarak sunucuya taşınmamalı |

`prisma/schema.prisma`, `src/lib/auth.ts`, `src/lib/rate-limit.ts`, `src/lib/storage.ts` dahil hiçbir kaynak dosyada sabit (hardcoded) sır **yoktur** — tamamı `process.env.*` üzerinden okunur. Bu, FAZ 0'ın CRITICAL bulgusunun (kaynak kodda açık şifre) yapısal olarak bir daha oluşamayacağının garantisidir: sır sızması artık yalnızca `.env` dosyasının yanlışlıkla paylaşılmasıyla mümkün olur, kaynak kod incelemesiyle değil.

## Değişkenler (bkz. `.env.example` — tam liste ve açıklamalar orada)

| Değişken | Zorunlu mu | Not |
|---|---|---|
| `DATABASE_URL` | ✅ | FAZ 1: `file:./dev.db` (SQLite). Taşınma yolu için `database.md` |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32` ile üretilmeli, ortamlar arası **paylaşılmamalı** |
| `NEXTAUTH_URL` | ✅ | Deploy domain'iyle değişmeli (prod'da `https://...`) |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | Yalnızca ilk kurulumda | `npm run seed:admin` sonrası **`.env`'den silinmesi ve panelden şifre değiştirilmesi önerilir** — bu bir tek seferlik bootstrap değeridir, kalıcı bir sır olarak tutulmamalıdır |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_MINUTES` | Hayır (varsayılan var) | Brute-force penceresi ayarı |
| `STORAGE_DRIVER` | Hayır (varsayılan `local`) | `s3`'e geçişte ek `S3_*` değişkenleri gerekir (bkz. `.env.example`) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Server component'lerin kendi API'sine `fetch` yapabilmesi için taban URL |

`NEXT_PUBLIC_` önekli olmayan hiçbir değişken tarayıcıya sızmaz — bu Next.js'in kendi kuralıdır ve bilinçli olarak yalnızca gerçekten public olması gereken tek değişken (`NEXT_PUBLIC_APP_URL`, zaten bir sır değil) bu önekle işaretlenmiştir.

## Ortamlar arası ayrım

- **Development**: `.env`, yerel SQLite dosyası, `NODE_ENV=development`, `npm run dev`.
- **Production**: ayrı bir `NEXTAUTH_SECRET` (asla dev ile aynı olmamalı), ayrı admin şifresi, `NODE_ENV=production`, `npm run build && npm run start`. Kalıcı disk sunmayan bir platforma (Vercel gibi) dağıtılacaksa `DATABASE_URL` hosted Postgres/libSQL'e çevrilmeli — bkz. `database.md`.
- Bu FAZ 1 teslimatında yalnızca development ortamı fiilen çalıştırılıp test edilmiştir; production dağıtımı (hosting seçimi, domain, HTTPS, ortam değişkenlerinin hosting panelinde girilmesi) kullanıcının/işletmenin bir sonraki adımıdır ve bu fazın kapsamı dışındadır.

## Sır rotasyonu / sızıntı durumunda

1. `NEXTAUTH_SECRET` değişirse tüm aktif oturumlar geçersiz olur (JWT imzası artık doğrulanamaz) — bu **beklenen ve güvenli** bir davranıştır, panik gerektirmez.
2. Admin şifresi şüpheli görünürse: admin panelinden (ileride eklenecek "şifre değiştir" ekranı FAZ 2'de önerilir) veya doğrudan `prisma/seed-admin.ts` script'i yeniden çalıştırılarak (mevcut kullanıcı güncellenecek şekilde uyarlanabilir) değiştirilebilir.
3. `.env` dosyası yanlışlıkla bir yere commit edilirse: `NEXTAUTH_SECRET` ve `ADMIN_SEED_PASSWORD` derhal değiştirilmeli, git geçmişinden dosyanın temizlenmesi (`git filter-repo` vb.) ayrı bir işlemdir.

## Neden `.env.example` git'te ama `.env` değil

`.env.example` gerçek değer içermez (yalnızca `CHANGE_ME_...` placeholder'ları ve açıklama yorumları) — amacı yeni bir geliştiricinin/ortamın hangi değişkenlere ihtiyaç duyduğunu bilmesidir. `.env` ise gerçek sırları içerdiği için `.gitignore`'da açıkça hariç tutulmuştur (`.env`, `.env.local`, `.env.production` — joker karakter (`*`) kullanılmadı, bilinçli olarak: bu sayede `.env.example` deseniyle **hiç eşleşmez** ve dosya adı üzerinden yanlışlıkla gizlenme riski yoktur; ekip yeni bir `.env.*` varyantı eklerse `.gitignore`'a açıkça satır eklemesi gerekir, bu da sırların "sessizce" ignore listesine girip aynı zamanda "sessizce" listeden çıkmasını önleyen bilinçli bir tercihtir).
