# Başlangıç — B&M Vourla FAZ 1 Web Uygulaması

Bu klasör, eski statik siteden (`index.html`, `products.js`, ...) farklı olarak
**çalıştırılması gereken** bir Next.js uygulamasıdır. Eski statik dosyalar
(bir üst klasörde) hiç dokunulmadan duruyor — bu yeni sistem onların yerine
şimdilik **paralel** çalışır, siz onaylayana kadar eski site değiştirilmedi.

## Gereksinim

Bilgisayarınızda **Node.js** kurulu olmalı (18 veya üzeri). Kurulu değilse:
https://nodejs.org adresinden "LTS" sürümünü indirip kurun.

## İlk çalıştırma (tek seferlik)

Bu klasörde bir terminal (Komut İstemi / PowerShell) açın ve sırayla:

```
npm install
npm run build
npm run start
```

Tarayıcıda `http://localhost:3000` adresini açın — genel site. Admin paneli:
`http://localhost:3000/admin`.

## Admin giriş bilgileri (geliştirme ortamı için üretildi)

- E-posta: `admin@bmvourla.com`
- Şifre: FAZ 1 tamamlanma raporunda (Bölüm Q) ayrıca, güvenli şekilde belirtildi.

**Giriş yaptıktan hemen sonra bu şifreyi değiştirmeniz önerilir** (şu an panelde
şifre değiştirme ekranı yok — FAZ 2 için not edildi; şimdilik `prisma/seed-admin.ts`
script'i `.env` dosyasındaki `ADMIN_SEED_PASSWORD` güncellenip tekrar
çalıştırılarak değiştirilebilir, ya da doğrudan veritabanından).

## Veritabanı

`prisma/dev.db` — SQLite dosyası, 257 gerçek ürününüz + FAZ 1 test/doğrulama
sırasında oluşturulan (ve sonra pasif/arşivlenmiş) birkaç deneme kaydıyla
birlikte geliyor, hazır durumda. Sıfırdan başlamak isterseniz:
`npx prisma migrate deploy && npm run seed && npm run seed:admin`.

## Bir sonraki adım

Bu, kalıcı bir web adresi (domain) üzerinden yayınlanmış değildir — şu an
yalnızca kendi bilgisayarınızda çalışır. Gerçek kullanıcıların erişebileceği
bir adrese taşımak (hosting/deploy) FAZ 1 kapsamı dışında bırakıldı; onayınızla
birlikte bir sonraki adım olarak ele alınabilir.

Detaylı teknik dokümantasyon için `docs/` klasörüne bakın.
