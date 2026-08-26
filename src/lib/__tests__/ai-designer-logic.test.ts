import { describe, it, expect } from "vitest";
import {
  computeArea,
  generateZones,
  generateBom,
  matchBomToCatalog,
  generateDesign,
  computeCostCard,
  buildCareGuide,
  reviseBom,
  DELIVERY_TYPES,
  type SpaceInput,
  type InternalProductRef,
  type AffiliateRef,
  type BomItem,
} from "@/lib/ai-designer-logic";
import { parseCommand, applyCommand, generateMockVisualLayout } from "@/lib/ai-designer-inputs";

const BASE_INPUT: SpaceInput = {
  spaceType: "TERAS",
  widthMeters: 4,
  depthMeters: 3,
  facade: "GUNEY",
  light: "TAM_GUNES",
  climate: "EGE",
  windExposed: false,
  usages: ["LOUNGE"],
  budget: "STANDART",
};

describe("delivery type", () => {
  it("CARGO ve STORE_PICKUP desteklenir", () => {
    expect(DELIVERY_TYPES).toEqual(["CARGO", "STORE_PICKUP"]);
  });
});

describe("ai-designer — alan + puzzle zoning", () => {
  it("metrekare hesaplanır", () => {
    expect(computeArea(BASE_INPUT)).toBe(12);
  });

  it("4 ürün-hizalı bölge üretir ve yüzdeler toplamı 100", () => {
    const zones = generateZones(BASE_INPUT);
    expect(zones.map((z) => z.id)).toEqual(["PLANTS", "SEEDS", "IRRIGATION", "ACCESSORIES"]);
    expect(zones.reduce((s, z) => s + z.areaPercent, 0)).toBe(100);
  });

  it("alan tipi bölge dağılımını değiştirir", () => {
    expect(generateZones(BASE_INPUT)[0].areaPercent).toBe(25); // TERAS PLANTS
    expect(generateZones({ ...BASE_INPUT, spaceType: "IC_MEKAN" })[0].areaPercent).toBe(40); // IC_MEKAN PLANTS
  });
});

describe("ai-designer — BOM", () => {
  it("temel bileşenleri üretir", () => {
    const bom = generateBom(BASE_INPUT, generateZones(BASE_INPUT));
    const kinds = bom.map((b) => b.kind);
    expect(kinds).toContain("bitki");
    expect(kinds).toContain("toprak");
    expect(kinds).toContain("saksi");
    expect(kinds).toContain("tohum");
    expect(kinds).toContain("hortum");
  });

  it("LOUNGE mobilya ekler; HOBI alet ekler", () => {
    const lounge = generateBom(BASE_INPUT, generateZones(BASE_INPUT));
    expect(lounge.some((b) => b.kind === "mobilya")).toBe(true);
    const hobi = generateBom({ ...BASE_INPUT, usages: ["HOBI"] }, generateZones(BASE_INPUT));
    expect(hobi.some((b) => b.kind === "alet")).toBe(true);
    expect(hobi.some((b) => b.kind === "mobilya")).toBe(false);
  });

  it("bütçe bitki adedini ölçekler", () => {
    const eco = generateBom({ ...BASE_INPUT, budget: "EKONOMIK" }, generateZones(BASE_INPUT)).find((b) => b.kind === "bitki")!.quantity;
    const pre = generateBom({ ...BASE_INPUT, budget: "PREMIUM" }, generateZones(BASE_INPUT)).find((b) => b.kind === "bitki")!.quantity;
    expect(pre).toBeGreaterThan(eco);
  });
});

describe("ai-designer — hibrit eşleştirme + maliyet kartı", () => {
  const internal: InternalProductRef[] = [
    { id: "p1", name: "Rattan Koltuk", sku: "S1", slug: "rattan-koltuk", price: 3000, categorySlug: "sus-esya", unit: "ADET" },
  ];
  const affiliate: AffiliateRef[] = [
    { id: "a1", name: "Lavanta", vendor: "Partner", affiliateUrl: "https://x.example", category: "bitki", estimatedPrice: 120 },
    { id: "a2", name: "Toprak", vendor: "Partner", affiliateUrl: "https://x.example", category: "toprak", estimatedPrice: 200 },
  ];

  it("iç kategorisi olmayan kalemler affiliate'e düşer", () => {
    const bom: BomItem[] = [
      { kind: "bitki", label: "Bitki", quantity: 3, unit: "adet" },
      { kind: "toprak", label: "Toprak", quantity: 50, unit: "litre" },
    ];
    const matched = matchBomToCatalog(bom, internal, affiliate);
    expect(matched[0].isAffiliate).toBe(true);
    expect(matched[0].affiliateProductId).toBe("a1");
  });

  it("iç kategori eşleşirse internal olur", () => {
    const bom: BomItem[] = [{ kind: "mobilya", label: "Mobilya", quantity: 1, unit: "set" }];
    const matched = matchBomToCatalog(bom, internal, affiliate);
    expect(matched[0].source).toBe("internal");
    expect(matched[0].productId).toBe("p1");
  });

  it("maliyet kartı iç + affiliate = toplam", () => {
    const result = generateDesign(BASE_INPUT, internal, affiliate);
    expect(result.cost.internalSubtotal + result.cost.affiliateSubtotal).toBeCloseTo(result.cost.total, 2);
    expect(result.cost.internalItemCount + result.cost.affiliateItemCount).toBe(result.items.length);
  });
});

describe("ai-designer — nokta revize", () => {
  it("yalnızca hedef bölgedeki kalemi değiştirir", () => {
    const bom = generateBom(BASE_INPUT, generateZones(BASE_INPUT));
    const revised = reviseBom(bom, { zone: "IRRIGATION", fromKind: "hortum", toKind: "sulama" });
    expect(revised.some((b) => b.kind === "sulama" && b.note?.includes("revize"))).toBe(true);
    // Diğer bölge (PLANTS) korunur.
    expect(revised.some((b) => b.kind === "bitki")).toBe(true);
  });
});

describe("ai-designer — multimodal girdi (kural-tabanlı parser + mock görsel)", () => {
  it("komut keyword'lerini ayrıştırır", () => {
    const parsed = parseCommand("güney cepheli, gölge, premium bir bostan istiyorum");
    expect(parsed.overrides.facade).toBe("GUNEY");
    expect(parsed.overrides.light).toBe("GOLGE");
    expect(parsed.overrides.budget).toBe("PREMIUM");
    expect(parsed.overrides.usages).toEqual(["HOBI"]);
  });

  it("applyCommand temel girdiyi geçersiz kılar", () => {
    const result = applyCommand(BASE_INPUT, "balkon, tam güneş");
    expect(result.spaceType).toBe("BALKON");
    expect(result.light).toBe("TAM_GUNES");
  });

  it("mock görsel deterministik SVG üretir", () => {
    const zones = generateZones(BASE_INPUT);
    const svg = generateMockVisualLayout(zones);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Bitkiler");
    expect(generateMockVisualLayout(zones)).toBe(svg);
  });
});

describe("ai-designer — bakım rehberi", () => {
  it("ışık/iklim/rüzgâra göre ipucu içerir", () => {
    const tips = buildCareGuide({ ...BASE_INPUT, windExposed: true });
    expect(tips.some((t) => t.includes("Rüzgâr"))).toBe(true);
    expect(tips.some((t) => t.includes("Akdeniz"))).toBe(true);
  });
});
