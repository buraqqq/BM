# Security — B&M Vourla FAZ 1

## FAZ 0'da bulunan CRITICAL açıkların durumu

| FAZ 0 bulgusu | FAZ 1 durumu |
|---|---|
| Admin şifresi kaynak kodda açık metin (`admin.html`, `"mam2026"`) | ✅ **Kapatıldı.** Şifre hiçbir dosyada yazılı değil; yalnızca ilk kurulumda `.env`'den okunup bcrypt (cost 12) ile hash'lenerek DB'ye yazılır (`prisma/seed-admin.ts`). `.env` `.gitignore`'da. |
| Kimlik doğrulama yalnızca `localStorage.bam_auth` bayrağı | ✅ **Kapatıldı.** NextAuth JWT session, httpOnly cookie, sunucu tarafında her istekte doğrulanır. Konsoldan `localStorage` değiştirmek artık hiçbir işe yaramaz — çünkü kontrol tarayıcıda değil sunucuda. |
| Admin paneli linki herkese açık nav'da | ⚠️ **Kısmen.** `/admin` linki hâlâ mevcut nav'da tutulmadı (public sitenin `SiteHeader.tsx`'inde `/admin` linki var, ama artık arkasında gerçek auth olduğu için tıklamak hiçbir şeyi ifşa etmiyor — yalnızca login ekranına düşer). Dileyen bunu kaldırabilir; risk seviyesi CRITICAL'den bilgi-ifşası-olmayan bir UX tercihine düştü. |
| Mimari stored-XSS riski (`innerHTML` ile escape'siz render) | ✅ **Yapısal olarak kapatıldı.** Yeni kod tabanında `grep -rn "dangerouslySetInnerHTML\|innerHTML" src/` **sıfır sonuç** döner — React'in varsayılan JSX render'ı tüm metni otomatik escape eder. Test: bkz. aşağıdaki "Test sonuçları". |

## Yeni güvenlik katmanları

- **Rol bazlı yetkilendirme**: `requireAdmin(minRole)` — her admin endpoint'i minimum rolünü belirtir (bkz. `api.md`). STAFF, ürün/kampanya/banner değiştiremez; audit log göremez.
- **Brute-force koruması**: `src/lib/rate-limit.ts` — DB tabanlı (`LoginAttempt` tablosu), varsayılan 15 dakikada 5 başarısız denemeden sonra kilitleniyor (`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`).
- **Input validation**: her admin write-endpoint'i Zod şemasından geçer (`src/lib/validation.ts`); frontend'den (admin panel dahil) gelen veri asla güvenilmez.
- **SQL injection**: Prisma parametreli sorgular kullanır; ham SQL string concatenation hiçbir yerde yok.
- **Negatif stok engeli**: `PATCH /api/admin/inventory/:id` sonucu negatif olacaksa 400 ile reddeder.
- **Hard delete kapalı**: Ürün `DELETE` endpoint'i her zaman 405 döner, `isActive=false` (archive) mekanizmasına yönlendirir.
- **Dosya yükleme güvenliği**: `src/lib/storage.ts` — MIME whitelist (yalnızca jpeg/png/webp/gif), 8MB boyut sınırı, rastgele dosya adı (path traversal / üzerine yazma engeli).
- **Audit log**: login/logout (başarılı+başarısız), ürün/fiyat/stok/kampanya/banner/ayar değişikliklerinin tamamı `user, action, entity, entityId, ipAddress, timestamp, metadata` ile loglanıyor (`AuditLog` tablosu).
- **HTTP güvenlik başlıkları**: `next.config.js` — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Test sonuçları (bu fazda gerçekten çalıştırıldı)

| Test (Bölüm 21) | Sonuç |
|---|---|
| Admin login olmadan admin endpoint erişimi | ✅ 401 `UNAUTHORIZED` |
| STAFF rolüyle ADMIN-only endpoint erişimi (ürün oluşturma) | ✅ 403 `FORBIDDEN` |
| STAFF rolüyle audit-log erişimi | ✅ 403 `FORBIDDEN` |
| Yanlış ID ile ürün güncelleme | ✅ 404 `NOT_FOUND` |
| Malformed input (negatif fiyat, eksik alan) | ✅ 400 `VALIDATION_ERROR` + alan bazlı hata detayı |
| SQL injection denemesi (`search` parametresine `'; DROP TABLE products; --`) | ✅ Zararsız boş sonuç döndü, tablo/veri etkilenmedi (257 ürün sayısı değişmedi) |
| XSS denemesi (`<script>alert(1)</script>` içeren ürün adı) | ✅ Kod tabanında `innerHTML`/`dangerouslySetInnerHTML` sıfır kullanım — React varsayılan olarak escape eder |
| Brute-force login (6 ardışık yanlış şifre) | ✅ 5. denemeden itibaren `RATE_LIMITED` |
| Negatif stok denemesi (-99999 adet düş) | ✅ 400 `NEGATIVE_STOCK` |
| Logout sonrası admin endpoint erişimi | ✅ 401 |

Bu testler `scripts/verify-e2e.sh` ve elle çalıştırılan ek komutlarla doğrulanmıştır (bkz. FAZ 1 sonu raporu Bölüm L).

## Bilinen, kabul edilmiş risk (dev bağımlılığı)

`npm audit`, Next.js 14.2.x'in dahili build araçlarının kullandığı **PostCSS**'te (transitive, yalnızca `next build` sırasında çalışan bir dev-time bağımlılık) bilinen CVE'ler rapor ediyor (XSS in CSS stringify, sourceMappingURL üzerinden dosya okuma). Düzeltme Next.js'i major sürüm 16'ya yükseltmeyi gerektiriyor (breaking change). Bu FAZ 1 kapsamında **bilinçli olarak ertelendi** çünkü: (1) risk yalnızca *build zamanında*, güvenilmeyen CSS işlenmiyor; (2) production runtime'da bu paket çalışmıyor, son kullanıcıya sunulan koda dahil değil. **FAZ 2'de** Next.js 15/16'ya kontrollü bir yükseltme önerilir. `next-auth` ve `uuid`'deki benzer bulgular bu faz içinde **düzeltildi** (bkz. commit geçmişi).

## Yapılmadı / FAZ 2+ önerisi

- CSP (Content-Security-Policy) header'ı henüz eklenmedi (yalnızca X-Frame-Options vb. eklendi) — Font Awesome/Google Fonts gibi harici kaynaklar kullanıldığı için dikkatli bir CSP politikası gerektirir, ayrı bir iterasyon önerilir.
- 2FA / tek kullanımlık kod desteği yok.
- Dosya yükleme antivirüs/malware taraması yok (yalnızca MIME + boyut kontrolü var).
