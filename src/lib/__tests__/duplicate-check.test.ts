import { describe, it, expect } from "vitest";
import { isSimilarName, checkDuplicates, normalizeForComparison, type ExistingProductRef } from "@/lib/duplicate-check";

// Bölüm 27 — Ürün Duplicate Kontrolü (deterministik, AI'sız).

describe("normalizeForComparison", () => {
  it("Türkçe karakterleri ve büyük/küçük harfi normalize eder", () => {
    expect(normalizeForComparison("Bahçe Hortumu 20M")).toBe(normalizeForComparison("bahce hortumu 20m"));
  });
});

describe("isSimilarName", () => {
  it("birebir aynı isimler benzer sayılır", () => {
    expect(isSimilarName("Bahçe Hortumu 20m", "Bahçe Hortumu 20m")).toBe(true);
  });

  it("küçük bir yazım farkı (tek karakter) benzer sayılır", () => {
    expect(isSimilarName("Bahçe Hortumu 20m", "Bahce Hortumu 20m")).toBe(true);
  });

  it("tamamen alakasız isimler benzer sayılmaz", () => {
    expect(isSimilarName("Bahçe Hortumu 20m", "Domates Tohumu Paketi")).toBe(false);
  });

  it("boş isimlerde false döner (kırılmaz)", () => {
    expect(isSimilarName("", "Bahçe Hortumu")).toBe(false);
    expect(isSimilarName("Bahçe Hortumu", "")).toBe(false);
  });

  it("uzun isimlerde küçük farklar hâlâ benzer sayılır ama büyük farklar sayılmaz", () => {
    const a = "Premium Bahçe Sulama Hortumu Spiral 25 Metre Yeşil";
    const bSmallDiff = "Premium Bahce Sulama Hortumu Spiral 25 Metre Yesil";
    const bBigDiff = "Premium Bahçe Sulama Hortumu Spiral 50 Metre Mavi Renkli Model";
    expect(isSimilarName(a, bSmallDiff)).toBe(true);
    expect(isSimilarName(a, bBigDiff)).toBe(false);
  });
});

describe("checkDuplicates", () => {
  const existing: ExistingProductRef[] = [
    { id: "p1", name: "Bahçe Hortumu 20m", sku: "BM-HORT-020", barcode: "8690000000011" },
    { id: "p2", name: "Domates Tohumu Paketi", sku: "BM-TOH-DOM", barcode: null },
  ];

  it("aynı SKU'da SAME_SKU uyarısı üretir", () => {
    const warnings = checkDuplicates({ name: "Farklı İsim", sku: "bm-hort-020" }, existing);
    expect(warnings.some((w) => w.type === "SAME_SKU" && w.existingProductId === "p1")).toBe(true);
  });

  it("aynı barkodda SAME_BARCODE uyarısı üretir", () => {
    const warnings = checkDuplicates({ name: "Farklı İsim", sku: "BM-YENI-001", barcode: "8690000000011" }, existing);
    expect(warnings.some((w) => w.type === "SAME_BARCODE" && w.existingProductId === "p1")).toBe(true);
  });

  it("çok benzer isimde SIMILAR_NAME uyarısı üretir (hard block değil)", () => {
    const warnings = checkDuplicates({ name: "Bahce Hortumu 20m", sku: "BM-YENI-002" }, existing);
    expect(warnings.some((w) => w.type === "SIMILAR_NAME" && w.existingProductId === "p1")).toBe(true);
  });

  it("hiçbir çakışma yoksa boş liste döner", () => {
    const warnings = checkDuplicates({ name: "Tamamen Yeni Ürün İsmi", sku: "BM-YENI-999" }, existing);
    expect(warnings).toEqual([]);
  });

  it("aynı adayda birden fazla uyarı türü aynı anda üretilebilir", () => {
    const warnings = checkDuplicates(
      { name: "Bahce Hortumu 20m", sku: "bm-hort-020", barcode: "8690000000011" },
      existing
    );
    const types = warnings.map((w) => w.type).sort();
    expect(types).toEqual(["SAME_BARCODE", "SAME_SKU", "SIMILAR_NAME"]);
  });
});
