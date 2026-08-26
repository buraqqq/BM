// ==========================================================
// FAZ 5 — AI Garden Designer: DETERMINISTIC kural-tabanlı peyzaj motoru.
//
// DB'siz, SAF (pure) fonksiyonlar (projenin kurulu deseni). LLM/Vision API
// anahtarı YOKSA veya kota biterse uygulama ÇÖKMEZ — bu motor her zaman
// çalışan deterministik "fallback"tir (bkz. ai-designer-llm.ts).
//
// Puzzle zoning: alanı 4 ürün-hizalı bölgeye ayırır, her bölge için bir BOM
// (malzeme listesi) üretir, BOM'u iç envanter + affiliate kataloğuyla eşleştirir
// ve "nokta revize" (tek bölgeyi ses/yazı ile değiştirme) destekler.
// ÖNERİLER YALNIZCA verilen katalog içindeki GERÇEK ürünlerden seçilir.
// ==========================================================

// ----------------------------------------------------------
// Girdi parametreleri
// ----------------------------------------------------------
export const SPACE_TYPES = ["BALKON", "TERAS", "BAHCE_ON", "BAHCE_ARKA", "IC_MEKAN"] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  BALKON: "Balkon",
  TERAS: "Teras",
  BAHCE_ON: "Ön Bahçe",
  BAHCE_ARKA: "Arka Bahçe",
  IC_MEKAN: "İç Mekan / Ofis",
};

export const FACADES = ["KUZEY", "GUNEY", "DOGU", "BATI"] as const;
export type Facade = (typeof FACADES)[number];

export const LIGHTS = ["TAM_GUNES", "YARI_GOLGE", "GOLGE"] as const;
export type Light = (typeof LIGHTS)[number];

export const CLIMATES = ["EGE", "AKDENIZ", "KARASAL", "KARADENIZ", "GENEL"] as const;
export type Climate = (typeof CLIMATES)[number];

export const USAGES = ["LOUNGE", "HOBI", "ESTETIK", "PET_COCUK"] as const;
export type Usage = (typeof USAGES)[number];

export const BUDGETS = ["EKONOMIK", "STANDART", "PREMIUM"] as const;
export type Budget = (typeof BUDGETS)[number];

/** Teslimat tercihi: CARGO (kargo) | STORE_PICKUP (mağazadan gel-al). */
export const DELIVERY_TYPES = ["CARGO", "STORE_PICKUP"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export interface SpaceInput {
  spaceType: SpaceType;
  widthMeters: number;
  depthMeters: number;
  facade: Facade;
  light: Light;
  climate: Climate;
  windExposed: boolean;
  usages: Usage[];
  budget: Budget;
}

// ----------------------------------------------------------
// Puzzle Zoning — 4 ürün-hizalı bölge
// ----------------------------------------------------------
export type ZoneId = "PLANTS" | "SEEDS" | "IRRIGATION" | "ACCESSORIES";

export interface Zone {
  id: ZoneId;
  title: string;
  description: string;
  areaPercent: number;
  areaSqm: number;
}

export const ZONE_LABELS: Record<ZoneId, string> = {
  PLANTS: "Zone A — Canlı Bitkiler & Ağaçlar",
  SEEDS: "Zone B — Tohum & Çim Alanı",
  IRRIGATION: "Zone C — Sulama & Damlama Tesisatı",
  ACCESSORIES: "Zone D — Aksesuar & Dış Envanter",
};

const ZONE_PERCENT_BY_SPACE: Record<SpaceType, Record<ZoneId, number>> = {
  BALKON: { PLANTS: 30, SEEDS: 10, IRRIGATION: 25, ACCESSORIES: 35 },
  TERAS: { PLANTS: 25, SEEDS: 15, IRRIGATION: 25, ACCESSORIES: 35 },
  BAHCE_ON: { PLANTS: 30, SEEDS: 30, IRRIGATION: 20, ACCESSORIES: 20 },
  BAHCE_ARKA: { PLANTS: 30, SEEDS: 30, IRRIGATION: 20, ACCESSORIES: 20 },
  IC_MEKAN: { PLANTS: 40, SEEDS: 5, IRRIGATION: 15, ACCESSORIES: 40 },
};

export function computeArea(input: SpaceInput): number {
  return Math.round(input.widthMeters * input.depthMeters * 10) / 10;
}

export function generateZones(input: SpaceInput): Zone[] {
  const area = computeArea(input);
  const percents = ZONE_PERCENT_BY_SPACE[input.spaceType];
  return (Object.keys(percents) as ZoneId[]).map((id) => ({
    id,
    title: ZONE_LABELS[id],
    description: zoneDescription(id, input),
    areaPercent: percents[id],
    areaSqm: Math.round((area * percents[id]) / 100 * 10) / 10,
  }));
}

function zoneDescription(id: ZoneId, input: SpaceInput): string {
  switch (id) {
    case "PLANTS":
      return "Canlı bitki, ağaç, saksı ve toprak için yeşil odak alanı.";
    case "SEEDS":
      return input.spaceType === "IC_MEKAN" ? "İç mekan bitki/tohum köşesi." : "Tohum ekimi ve çim alanı.";
    case "IRRIGATION":
      return "Hortum, damlama ve otomatik sulama tesisatı.";
    case "ACCESSORIES":
      return input.usages.includes("LOUNGE") ? "Mobilya, aydınlatma, dekor ve bakım ekipmanı." : "Dekor, aydınlatma ve bakım ekipmanı.";
  }
}

// ----------------------------------------------------------
// BOM (İhtiyaç Listesi)
// ----------------------------------------------------------
export type BomKind = "bitki" | "tohum" | "toprak" | "saksi" | "hortum" | "sulama" | "gubre" | "alet" | "cim" | "mobilya" | "aydinlatma" | "dekor";

export interface BomItem {
  kind: BomKind;
  label: string;
  quantity: number;
  unit: string;
  note?: string;
}

const BUDGET_MULTIPLIER: Record<Budget, number> = { EKONOMIK: 0.7, STANDART: 1, PREMIUM: 1.5 };

export function generateBom(input: SpaceInput, zones: Zone[]): BomItem[] {
  const area = computeArea(input);
  const byZone = (id: ZoneId) => zones.find((z) => z.id === id)?.areaSqm ?? 0;
  const plants = byZone("PLANTS");
  const seeds = byZone("SEEDS");
  const irrigation = byZone("IRRIGATION");
  const accessories = byZone("ACCESSORIES");
  const budgetFactor = BUDGET_MULTIPLIER[input.budget];

  const plantCount = Math.max(1, Math.round(plants * 2 * budgetFactor));
  const potCount = Math.max(1, Math.round(plants * 1.5 * budgetFactor));
  const soilLiters = Math.max(10, Math.round(plants * 30 * budgetFactor));
  const seedPackets = seeds > 0 ? Math.max(1, Math.round(seeds * 3 * budgetFactor)) : 0;
  const grassSqm = input.spaceType !== "IC_MEKAN" && seeds > 0 ? Math.max(1, Math.round(seeds)) : 0;
  const hoseMeters = irrigation > 0 ? Math.max(1, Math.round(irrigation * 2)) : 0;
  const dripKits = irrigation > 0 ? 1 : 0;
  const fertilizerKg = Math.max(1, Math.round((plants + seeds) * 0.3));
  const toolSets = input.usages.includes("HOBI") ? 1 : 0;
  const furnitureSets = input.usages.includes("LOUNGE") ? Math.max(1, Math.round(accessories / 6)) : 0;
  const lightingUnits = Math.max(0, Math.round(area * 0.5));
  const decorPieces = Math.max(0, Math.round(accessories * 0.5 * budgetFactor));

  const items: BomItem[] = [
    { kind: "bitki", label: "Canlı bitki / fidan", quantity: plantCount, unit: "adet", note: plantNote(input) },
    { kind: "saksi", label: "Saksı", quantity: potCount, unit: "adet" },
    { kind: "toprak", label: "Toprak / torf", quantity: soilLiters, unit: "litre" },
  ];
  if (seedPackets > 0) items.push({ kind: "tohum", label: "Tohum paketi", quantity: seedPackets, unit: "paket" });
  if (grassSqm > 0) items.push({ kind: "cim", label: "Çim (suni/doğal)", quantity: grassSqm, unit: "m²" });
  if (hoseMeters > 0) items.push({ kind: "hortum", label: "Hortum", quantity: hoseMeters, unit: "metre" });
  if (dripKits > 0) items.push({ kind: "sulama", label: "Damlama / sulama kiti", quantity: dripKits, unit: "set" });
  if (fertilizerKg > 0) items.push({ kind: "gubre", label: "Gübre", quantity: fertilizerKg, unit: "kg" });
  if (toolSets > 0) items.push({ kind: "alet", label: "Bakım alet seti", quantity: toolSets, unit: "set" });
  if (furnitureSets > 0) items.push({ kind: "mobilya", label: "Bahçe mobilyası", quantity: furnitureSets, unit: "set" });
  if (lightingUnits > 0) items.push({ kind: "aydinlatma", label: "Aydınlatma", quantity: lightingUnits, unit: "adet" });
  if (decorPieces > 0) items.push({ kind: "dekor", label: "Dekoratif öğe", quantity: decorPieces, unit: "adet" });

  return items;
}

function plantNote(input: SpaceInput): string {
  const lightPart = input.light === "TAM_GUNES" ? "güneş seven" : input.light === "GOLGE" ? "gölgeye dayanıklı" : "yarı gölge";
  const climatePart = input.climate === "EGE" || input.climate === "AKDENIZ" ? "kuraklığa dayanıklı" : "ılıman";
  const windPart = input.windExposed ? ", rüzgâra dayanıklı" : "";
  return `${lightPart}, ${climatePart}${windPart} türler`;
}

// ----------------------------------------------------------
// Hibrit envanter + affiliate eşleştirme
// ----------------------------------------------------------
export interface InternalProductRef {
  id: string;
  name: string;
  sku: string;
  slug: string;
  price: number;
  categorySlug: string;
  unit: string;
}

export interface AffiliateRef {
  id: string;
  name: string;
  vendor: string;
  affiliateUrl: string;
  category: string;
  estimatedPrice: number | null;
}

export interface MatchedItem {
  kind: BomKind;
  label: string;
  quantity: number;
  unit: string;
  note?: string;
  source: "internal" | "affiliate";
  isAffiliate: boolean;
  name: string;
  price: number | null;
  productId?: string;
  sku?: string;
  slug?: string;
  categorySlug?: string;
  vendor?: string;
  affiliateUrl?: string;
  affiliateProductId?: string;
}

/** BOM türü → iç kategori slug'ları (öncelik sırasıyla). */
const INTERNAL_CATEGORY_BY_KIND: Partial<Record<BomKind, string[]>> = {
  bitki: ["bitki"],
  tohum: ["tohum"],
  toprak: ["toprak-gubre", "saksi"],
  saksi: ["saksi"],
  hortum: ["hortum", "sulama"],
  sulama: ["sulama"],
  gubre: ["toprak-gubre"],
  alet: ["alet"],
  cim: ["cim"],
  mobilya: ["sus-esya", "konfor"],
  aydinlatma: ["dekorasyon"],
  dekor: ["sus-esya", "dekorasyon"],
};

/** BOM türü → affiliate kategorisi. */
const AFFILIATE_CATEGORY_BY_KIND: Record<BomKind, string> = {
  bitki: "bitki",
  tohum: "tohum",
  toprak: "toprak",
  saksi: "saksi",
  hortum: "hortum",
  sulama: "sulama",
  gubre: "gubre",
  alet: "alet",
  cim: "cim",
  mobilya: "mobilya",
  aydinlatma: "aydinlatma",
  dekor: "dekor",
};

function groupBy<T>(items: T[], key: (i: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

export function matchBomToCatalog(bom: BomItem[], internalProducts: InternalProductRef[], affiliateProducts: AffiliateRef[]): MatchedItem[] {
  const internalByCategory = groupBy(internalProducts, (i) => i.categorySlug);
  const affiliateByCategory = groupBy(affiliateProducts, (a) => a.category);

  return bom.map((item) => {
    for (const cat of INTERNAL_CATEGORY_BY_KIND[item.kind] ?? []) {
      const match = internalByCategory.get(cat)?.[0];
      if (match) {
        return {
          kind: item.kind, label: item.label, quantity: item.quantity, unit: item.unit, note: item.note,
          source: "internal" as const, isAffiliate: false, name: match.name, price: match.price,
          productId: match.id, sku: match.sku, slug: match.slug, categorySlug: match.categorySlug,
        };
      }
    }
    const affCat = AFFILIATE_CATEGORY_BY_KIND[item.kind];
    const aff = affiliateByCategory.get(affCat)?.[0];
    if (aff) {
      return {
        kind: item.kind, label: item.label, quantity: item.quantity, unit: item.unit, note: item.note,
        source: "affiliate" as const, isAffiliate: true, name: aff.name, price: aff.estimatedPrice,
        vendor: aff.vendor, affiliateUrl: aff.affiliateUrl, affiliateProductId: aff.id,
      };
    }
    return {
      kind: item.kind, label: item.label, quantity: item.quantity, unit: item.unit, note: item.note,
      source: "affiliate" as const, isAffiliate: true, name: item.label, price: null,
      vendor: "Partner", affiliateUrl: null as unknown as string,
    };
  });
}

// ----------------------------------------------------------
// Bakım rehberi
// ----------------------------------------------------------
export function buildCareGuide(input: SpaceInput): string[] {
  const tips: string[] = [];
  if (input.light === "TAM_GUNES") tips.push("Yoğun güneş alan bölgelerde sulamayı sabah erken veya akşam geç yapın.");
  if (input.light === "GOLGE") tips.push("Gölge bölgeler için düşük ışık isteği olan türleri tercih edin.");
  if (input.windExposed) tips.push("Rüzgârlı alanlar için rüzgâra dayanıklı bitkiler ve sabit saksılar kullanın.");
  if (input.climate === "EGE" || input.climate === "AKDENIZ") tips.push("Akdeniz/Ege ikliminde yazın haftada en az 2 kez derin sulama önerilir.");
  if (input.usages.includes("HOBI")) tips.push("Hobi/bostan için gübrelemeyi ayda bir organik gübre ile tekrarlayın.");
  if (input.usages.includes("PET_COCUK")) tips.push("Evcil hayvan/çocuk dostu alan için dikenli/toksik bitkilerden kaçının.");
  if (input.usages.includes("LOUNGE")) tips.push("Oturma alanını güneş açısına göre konumlandırın; öğleden sonra gölge sağlayın.");
  return tips;
}

// ----------------------------------------------------------
// Üst seviye tasarım + maliyet kartı
// ----------------------------------------------------------
export interface CostCard {
  internalSubtotal: number;
  affiliateSubtotal: number;
  total: number;
  internalItemCount: number;
  affiliateItemCount: number;
}

export interface DesignResult {
  areaSqm: number;
  zones: Zone[];
  bom: BomItem[];
  items: MatchedItem[];
  careGuide: string[];
  cost: CostCard;
}

export function computeCostCard(items: MatchedItem[]): CostCard {
  const internal = items.filter((i) => i.source === "internal");
  const affiliate = items.filter((i) => i.source === "affiliate");
  const internalSubtotal = Math.round(internal.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0) * 100) / 100;
  const affiliateSubtotal = Math.round(affiliate.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0) * 100) / 100;
  return {
    internalSubtotal,
    affiliateSubtotal,
    total: Math.round((internalSubtotal + affiliateSubtotal) * 100) / 100,
    internalItemCount: internal.length,
    affiliateItemCount: affiliate.length,
  };
}

export function generateDesign(input: SpaceInput, internalProducts: InternalProductRef[], affiliateProducts: AffiliateRef[]): DesignResult {
  const zones = generateZones(input);
  const bom = generateBom(input, zones);
  const items = matchBomToCatalog(bom, internalProducts, affiliateProducts);
  return { areaSqm: computeArea(input), zones, bom, items, careGuide: buildCareGuide(input), cost: computeCostCard(items) };
}

// ----------------------------------------------------------
// Nokta Revize (tek bölgeyi komutla değiştir)
//
// "Sadece Zone C'deki hortumu damlama sistemine çevir" gibi tek-bölge
// revizyonu. Deterministik: verilen hedef bölge/bileşen için o kalemi
// değiştirir; diğer bölgeler korunur.
// ----------------------------------------------------------
export interface ReviseInstruction {
  /** Hangi bölge revize edilecek (zone id). */
  zone: ZoneId;
  /** Hangi BOM türü değiştirilecek (opsiyonel — verilmezse bölgedeki tüm kalemler). */
  fromKind?: BomKind;
  /** Yeni BOM türü. */
  toKind: BomKind;
}

export function reviseBom(bom: BomItem[], instruction: ReviseInstruction): BomItem[] {
  // Bölge→kind eşlemesi: bölgedeki kalemleri belirlemek için kullanılır.
  const zoneKinds: Record<ZoneId, BomKind[]> = {
    PLANTS: ["bitki", "saksi", "toprak"],
    SEEDS: ["tohum", "cim"],
    IRRIGATION: ["hortum", "sulama"],
    ACCESSORIES: ["gubre", "alet", "mobilya", "aydinlatma", "dekor"],
  };

  return bom.map((item) => {
    const inZone = zoneKinds[instruction.zone].includes(item.kind);
    if (!inZone) return item;
    if (instruction.fromKind && item.kind !== instruction.fromKind) return item;
    // Deterministik miktar koruması: birim türü farklıysa miktarı 1'e çek.
    const keepQty = item.kind === instruction.toKind ? item.quantity : Math.max(1, item.quantity);
    return { ...item, kind: instruction.toKind, quantity: keepQty, note: `(revize: ${item.kind} → ${instruction.toKind})` };
  });
}
