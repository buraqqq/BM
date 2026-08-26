# B&M VOURLA — FAZ 5 TAMAMLANMA RAPORU
## AI Garden Designer Engine & Dual PWA Altyapısı

Tarih: 2026-08-27

---

## A — Amaç ve kapsam

Projeyi sıradan e-ticaretten "A'dan Z'ye Bahçe Market + Dual PWA + Görsel/Sesli
AI Bahçe Tasarımcısı" ekosistemine taşıyan faz. Kullanıcının alanını bölgelere
ayıran (puzzle zoning), ihtiyaç listesi (BOM) çıkaran, bu listeyi iç envanter +
gelir ortaklığı (affiliate) ürünleriyle eşleştiren sistem kuruldu. Gerçek LLM/
Vision API anahtarı YOKSA uygulama ÇÖKMEZ — deterministic kural-tabanlı motor
her zaman çalışan fallback'tir.

## B — Katalog genişletme & teslimat tipi

- **7 yeni kategori** (şema zaten generic Category modeliyle destekliyordu;
  veri olarak eklendi): Canlı Bitkiler & Ağaçlar, Sebze & Çiçek Tohumları,
  Sulama & Damlama, Hortumlar, Saksılar, Toprak & Gübre, Bahçe Aletleri.
  `prisma/seed-garden-categories.ts` ile boş açıldı (toplam 14 kategori) —
  **257 aktif / 260 toplam ürün baseline'ı KORUNDU** (ürün EKLENMEDİ).
- **Teslimat tipi**: `DELIVERY_TYPES = ["CARGO", "STORE_PICKUP"]` (enums). Bu,
  FAZ 4B'den beri var olan `deliveryMethod` (`DELIVERY`/`PICKUP`) ile birebir
  aynı kavramdır — **paralel/duplicate alan YARATILMADI** (mevcut sistem yeniden
  yazılmadı); `CARGO`↔`DELIVERY`, `STORE_PICKUP`↔`PICKUP` eşlemesi `enums.ts`'te
  belgelendi.

## C — Dual PWA

- **Market PWA** (`public/manifest.json`): start_url `/`, alışveriş/katalog odaklı.
- **AI Studio PWA** (`public/manifest-studio.json`): start_url `/bahce-tasarimi`,
  `display: fullscreen`, farklı tema rengi.
- `public/sw.js` (bağımlılıksız el-yazımı SW — next-pwa/Workbox yerine bilinçli):
  navigation'da network-first + offline fallback, statik asset'te cache-first.
- `public/offline.html`, SVG ikonlar (`icon.svg`, `icon-maskable.svg`).
- `src/components/PwaInstaller.tsx`: SW kaydı + `beforeinstallprompt` ile
  "Uygulamayı Yükle" butonu. `layout.tsx`'e manifest + theme-color eklendi.

## D — AI Garden Designer Engine (`src/lib/ai-designer-logic.ts`)

SAF, DB'siz, deterministik. Girdi: alan tipi, m² (genişlik×derinlik), cephe,
ışık, iklim, rüzgâr, kullanım amacı, bütçe.

- **Puzzle Zoning**: alanı 4 ürün-hizalı bölgeye ayırır — Zone A (Canlı Bitkiler
  & Ağaçlar), Zone B (Tohum & Çim), Zone C (Sulama & Damlama), Zone D (Aksesuar
  & Dış Envanter). Alan tipine göre yüzde dağılımı.
- **BOM**: bitki, tohum, toprak, saksı, hortum, sulama, gübre, alet, çim, mobilya,
  aydınlatma, dekor — kalem kalem, bütçe/kullanım/ışık-iklime göre miktar.
- **Nokta Revize** (`reviseBom`): tek bölge/bileşeni komutla değiştirir
  ("Zone C'deki hortumu damlama sistemine çevir"), diğer bölgeler korunur.

## E — Multimodal girdi (`src/lib/ai-designer-inputs.ts`)

- `PhotoInput` (kamera/galeri dataUrl), `voiceTranscript`/`textCommand`.
- Kural-tabanlı Türkçe komut parser'ı (`parseCommand`): "güney, gölge, premium
  bostan" → yapılandırılmış SpaceInput override.
- `generateMockVisualLayout`: Visual AI fallback — deterministik SVG yerleşim planı.

## F — Hibrit BOM & Affiliate

- `AffiliateProduct` modeli (ayrı tablo — Product baseline'ını etkilemez):
  `name`, `vendor`, `affiliateUrl`, `category`, `estimatedPrice`. 19 örnek kayıt
  (placeholder vendor/URL, admin doldurur).
- Eşleştirme: BOM kalemi önce iç kategoriyle eşleşir (ürün varsa "Sepete Ekle"),
  yoksa affiliate'e düşer (dış "Satın Al (Partner)" bağlantısı).
- **Maliyet kartı**: iç mağaza tutarı + partner tutarı = Toplam Tasarım Maliyeti.

## G — API & UI

- `POST /api/ai-designer/design` (halka açık): alan girdisi + opsiyonel komut →
  tasarım + mock görsel. Hiçbir veri YAZMAZ; öneriler yalnızca GERÇEK ürünler.
- `/bahce-tasarimi` sayfası + `GardenDesignerPage` (wizard + komut + görsel +
  bölgeleme + BOM + maliyet kartı + "Tüm İç Ürünleri Sepete Ekle").
- Nav'a "Bahçe Tasarımı" eklendi.

## H — Doğrulama (gerçek, yeşil)

| Kontrol | Sonuç |
|---|---|
| `npx tsc --noEmit` | 0 hata |
| `npm test` | **210/210** geçti (20 dosya; +15 AI designer testi) |
| `npm run build` | başarılı (`/bahce-tasarimi`, `/api/ai-designer/design` üretildi) |
| `db-integrity-check` | **0 bulgu**; 257 aktif / 260 toplam ürün KORUNDU; 14 kategori |

## I — Git commit'leri (atomik)

```
feat(catalog): garden categories + affiliate product model
feat(ai): rule-based garden designer engine + multimodal inputs
feat(ai): designer API + studio UI
feat(pwa): dual PWA (market + studio) manifest + service worker
test(ai): designer unit tests
docs: FAZ 5 tamamlanma raporu
```

## J — Bilinen sınırlar (dürüst)

- **Gerçek LLM/Vision API bağlanmadı** — sağlayıcı seçimi + API key kullanıcı
  onayına bağlı; `ai-designer-llm.ts` tek değişiklik noktası, şu an her zaman
  `rule-based` fallback döner.
- **Fotoğraf/ses gerçek analizi yok** — `PhotoInput`/`voiceTranscript` altyapısı
  hazır, mock görsel deterministik üretilir; Web Speech API/kamera UI'ı istemci
  tarafında bağlanabilir (altyapı hazır).
- **Yeni kategoriler boş** — ürün girilmedi (baseline korundu); ürün girildiğinde
  motor bunları otomatik "internal" olarak eşleştirir.
- **Affiliate vendor/URL placeholder** — gerçek partner bağlantıları admin'de
  girilecek.

---

**FAZ 5 TAMAMLANDI.** FAZ 5 dışında hiçbir yeni büyük faza geçilmedi. Kullanıcı
onayı bekleniyor.
