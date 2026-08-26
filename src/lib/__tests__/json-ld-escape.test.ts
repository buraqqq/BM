import { describe, it, expect } from "vitest";
import { safeJsonLdString } from "@/lib/json-ld-escape";

// FAZ2.1'de restore edilen BM-BAHARAT-054 test ürününün adı tam olarak
// "<script>alert(1)</script>XSSTEST" idi — JSON-LD'ye gömülecek herhangi
// bir ürün adının bu senaryoyu güvenle atlatabildiğini doğruluyoruz.
describe("safeJsonLdString", () => {
  it("normal veriyi olduğu gibi JSON'a çevirir", () => {
    expect(safeJsonLdString({ name: "Yeşil Hortum" })).toBe('{"name":"Yeşil Hortum"}');
  });

  it("'</script>' içeren bir alanı script kapanışını tetiklemeyecek şekilde kaçırır", () => {
    const malicious = "<script>alert(1)</script>XSSTEST";
    const out = safeJsonLdString({ name: malicious });
    // Tarayıcının bir kapanış <script> etiketi olarak tanıyabileceği HER
    // yerdeki "<" karakteri kaçırıldığı için literal "</script>" hiçbir
    // yerde kalmaz (yalnızca "\u003c/script>" olarak geçer — bu, bir HTML
    // parser'ı için etiket açılışı SAYILMAZ, sadece metindir).
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
    // JSON olarak hâlâ geçerli ve orijinal değeri kayıpsız taşıyor.
    expect(JSON.parse(out)).toEqual({ name: malicious });
  });

  it("string içinde olmayan bir '<' de aynı şekilde kaçırılır (savunma derinliği)", () => {
    expect(safeJsonLdString({ a: "1 < 2" })).toBe('{"a":"1 \\u003c 2"}');
  });
});
