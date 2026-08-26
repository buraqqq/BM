/**
 * `<`'yi `<`'ye kaçırarak, JSON-LD içine gömülen bir veri değerinin
 * (ör. ürün adı) `</script>` alt-dizesi içermesi durumunda <script>
 * etiketinden erken çıkışı engeller. Bkz. src/components/JsonLd.tsx —
 * burada saf fonksiyon olarak ayrılmasının nedeni birim testidir
 * (FAZ2.1'de görülen `<script>alert(1)</script>` test verisi tam olarak bu
 * senaryoyu kapsıyor).
 */
export function safeJsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
