# Future AI Architecture — FAZ 2+ (bu fazda UYGULANMADI)

> **Önemli:** Bu dokümandaki hiçbir şey FAZ 1'de kodlanmamıştır. Bu sayfa yalnızca FAZ 0 audit raporunda taslağı çizilen "AI Garden Designer" / "AI Orchestrator" vizyonunun, FAZ 1'de kurulan gerçek mimariyle (DB, API katmanı, admin sistemi) nasıl uyumlu ilerleyebileceğini belgeler — ileriye dönük bir tasarım notudur, bir taahhüt değildir. Kullanıcının FAZ 1 talimatı bu fazda AI özelliklerini **açıkça kapsam dışı** bırakmıştır (“AI Garden Designer ekleme”, “AI API entegrasyonu”), bu doküman o kısıtlamayı ihlal etmez, yalnızca gelecekteki bir FAZ için zemin hazırlar.

## Neden şimdi değil

FAZ 1'in hedefi "gerçek bir veritabanı ve gerçek bir admin sistemi" kurmaktı — bu, herhangi bir AI özelliğinin **önkoşuludur**: AI'ın öneri üretebilmesi için önce gerçek ürün/kategori/fiyat verisinin sorgulanabilir bir API üzerinden var olması gerekir. FAZ 1 öncesinde (statik `products.js`) bir AI orchestrator'ın bağlanabileceği hiçbir API yoktu. Şimdi (`GET /api/products`, `GET /api/categories`, fiyat motoru) bu temel var — bu da FAZ 2+'ta AI eklemeyi mimari olarak mümkün kılan asıl gelişmedir.

## Hedef akış (FAZ 0'da tanımlanan, henüz kodlanmayan)

1. Kullanıcı (site ziyaretçisi) bahçesinin/mangal alanının bir fotoğrafını veya ölçülerini/tercihlerini girer.
2. **AI Orchestrator** (yeni bir servis katmanı, örn. `src/lib/ai/orchestrator.ts`) bu girdiyi alır, bir prompt'a dönüştürür.
3. Orchestrator, **gerçek ürün kataloğunu** FAZ 1'de kurulan `GET /api/products` (kategori/etiket filtreleriyle) üzerinden çeker — öneriler **halüsinasyon ürünler değil, gerçekten stokta/kategoride olan ürünler** arasından seçilir. Bu, FAZ 1'in en kritik mimari katkısıdır: AI'ın "var olmayan ürün önerme" riski, önerileri gerçek DB sorgusuyla kısıtlayarak yapısal olarak engellenir.
4. Seçilen ürün kombinasyonu + bir görsel üretim çağrısı (harici bir görsel AI API'si — sağlayıcı henüz seçilmedi) ile bir "önerilen bahçe/mangal alanı" görseli üretilir.
5. Üretilen görsel `src/lib/storage.ts`'in zaten desteklediği `ai-generated` kategorisine (FAZ 1'de storage şemasına bilinçli olarak eklenmiş, boş duran bir klasör) yazılır.
6. Öneri + ürün listesi + görsel kullanıcıya gösterilir, "sepete ekle" (FAZ 2+ e-ticaret altyapısıyla) veya "WhatsApp'tan sor" (mevcut `Setting` tablosundaki whatsapp numarasıyla, hemen bugün de yapılabilir) seçenekleri sunulur.

## FAZ 1'in bunun için hazırladığı temeller

| FAZ 1'de kurulan | AI akışında nasıl kullanılacak |
|---|---|
| `GET /api/products?category=&search=&featured=` | Orchestrator'ın öneri havuzu — gerçek, güncel, aktif ürünler |
| `src/lib/storage.ts` → `ai-generated` klasör kategorisi | Üretilen görsellerin depolanacağı, zaten ayrılmış yer |
| `Setting` tablosu (whatsapp, iletişim) | AI önerisinden sonra "bize ulaşın" köprüsü — kod değişikliği gerektirmez |
| `AuditLog` genel şeması (`entity`, `action`, `metadataJson`) | AI çağrılarının (kim, ne zaman, ne sorguladı, ne önerildi) loglanması aynı tabloya `entity: "AiRecommendation"` ile eklenebilir — yeni tablo gerekmez |
| Zod validation deseni (`src/lib/validation.ts`) | Kullanıcıdan gelen serbest metin/görsel girdisinin AI'a gönderilmeden önce doğrulanması aynı desenle yapılabilir |
| Rol bazlı yetkilendirme (`requireAdmin`) | AI orchestrator'ın maliyetli API çağrılarını admin panelinden açıp kapatabilme (bir `Setting` anahtarı ile, örn. `ai_features_enabled`) — kod değişikliği gerektirmeden feature flag |

## Kapsam dışı bırakılan kararlar (bilinçli olarak FAZ 1'de verilmedi)

- Hangi görsel-üretim API'sinin kullanılacağı (maliyet, gecikme, içerik politikası karşılaştırması gerekir).
- Kullanıcı başına AI çağrı limiti / maliyet kontrolü mekanizması.
- Üretilen görsellerin moderasyonu (uygunsuz girdi/çıktı riski).
- AI önerisinin gerçek zamanlı mı yoksa arka planda kuyruklanmış bir iş mi (queue/worker) olacağı — FAZ 1'de hiçbir arka plan iş kuyruğu altyapısı kurulmadı, bu da FAZ 2+'ta ayrıca değerlendirilmesi gereken bir karardır.

## Sonuç

Bu doküman bir taahhüt değil, bir hazır-zemin envanteridir: FAZ 1'de "AI'ı bugün kodlamadan, AI'ı yarın kolaylaştıracak temelleri kurma" ilkesiyle ilerlendi (gerçek API, kategorize edilmiş storage, genel audit şeması, feature-flag'e uygun Settings tablosu). FAZ 2+ kapsam kararı ve tedarikçi seçimi tamamen kullanıcının onayına bağlıdır.
