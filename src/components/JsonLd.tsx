import { safeJsonLdString } from "@/lib/json-ld-escape";

/**
 * FAZ 3 — Bölüm 7: schema.org JSON-LD enjeksiyonu.
 *
 * `dangerouslySetInnerHTML` burada KAÇINILMAZ (Next.js'te bir <script
 * type="application/ld+json"> içeriğini başka türlü doldurmanın yolu yok).
 * docs/security.md'de belirtilen "kod tabanında 0 dangerouslySetInnerHTML"
 * ilkesi HTML render'ı için geçerliydi (React JSX metin içeriği otomatik
 * escape eder) — burada risk farklı: veri HTML değil JSON olarak
 * yorumlanıyor, ama içindeki bir "</script>" alt-dizesi yine de tarayıcıyı
 * script etiketinden erken çıkarabilir. safeJsonLdString bunu engeller
 * (bkz. src/lib/json-ld-escape.ts, birim testli).
 */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdString(data) }} />;
}
