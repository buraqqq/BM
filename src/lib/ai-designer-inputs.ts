// ==========================================================
// FAZ 5 — AI Garden Designer: MULTIMODAL girdi katmanı.
//
// Fotoğraf (kamera/galeri), ses (Web Speech API) ve yazılı komut girdilerini
// birleştirir. Gerçek bir LLM/Vision API YOKSA, görsel çıktı için DETERMINISTIC
// mock layout üreticisi ve komutlar için kural-tabanlı (keyword) parser devreye
// girer — uygulama asla çökmez (bkz. ai-designer-llm.ts).
// ==========================================================

import {
  type SpaceInput,
  type SpaceType,
  type Facade,
  type Light,
  type Climate,
  type Usage,
  type Budget,
  type Zone,
  ZONE_LABELS,
} from "@/lib/ai-designer-logic";

// ----------------------------------------------------------
// Girdi tipleri
// ----------------------------------------------------------
export interface PhotoInput {
  dataUrl: string;
  source: "camera" | "gallery";
}

export interface DesignerCommandInput {
  photo?: PhotoInput;
  textCommand?: string;
  voiceTranscript?: string;
  space: SpaceInput;
}

/** Komut katmanından türetilen yapılandırılmış giriş. */
export interface ParsedCommand {
  overrides: Partial<SpaceInput>;
  matchedKeywords: string[];
}

// ----------------------------------------------------------
// Kural-tabanlı komut parser'ı (deterministik — LLM fallback)
// ----------------------------------------------------------
const KEYWORDS: { keys: string[]; apply: (text: string) => Partial<SpaceInput> }[] = [
  { keys: ["balkon"], apply: () => ({ spaceType: "BALKON" as SpaceType }) },
  { keys: ["teras", "teras"], apply: () => ({ spaceType: "TERAS" as SpaceType }) },
  { keys: ["ön bahçe", "on bahce"], apply: () => ({ spaceType: "BAHCE_ON" as SpaceType }) },
  { keys: ["arka bahçe", "arka bahce"], apply: () => ({ spaceType: "BAHCE_ARKA" as SpaceType }) },
  { keys: ["iç mekan", "ic mekan", "ofis"], apply: () => ({ spaceType: "IC_MEKAN" as SpaceType }) },
  { keys: ["kuzey"], apply: () => ({ facade: "KUZEY" as Facade }) },
  { keys: ["güney", "guney"], apply: () => ({ facade: "GUNEY" as Facade }) },
  { keys: ["doğu", "dogu"], apply: () => ({ facade: "DOGU" as Facade }) },
  { keys: ["batı", "bati"], apply: () => ({ facade: "BATI" as Facade }) },
  { keys: ["tam güneş", "tam gunes", "güneşli"], apply: () => ({ light: "TAM_GUNES" as Light }) },
  { keys: ["yarı gölge", "yari golge"], apply: () => ({ light: "YARI_GOLGE" as Light }) },
  { keys: ["gölge", "golge"], apply: () => ({ light: "GOLGE" as Light }) },
  { keys: ["ege", "izmir"], apply: () => ({ climate: "EGE" as Climate }) },
  { keys: ["akdeniz"], apply: () => ({ climate: "AKDENIZ" as Climate }) },
  { keys: ["karasal"], apply: () => ({ climate: "KARASAL" as Climate }) },
  { keys: ["karadeniz"], apply: () => ({ climate: "KARADENIZ" as Climate }) },
  { keys: ["lounge", "dinlenme", "oturma"], apply: () => ({ usages: ["LOUNGE"] as Usage[] }) },
  { keys: ["hobi", "bostan", "sebze"], apply: () => ({ usages: ["HOBI"] as Usage[] }) },
  { keys: ["estetik", "süs", "sus"], apply: () => ({ usages: ["ESTETIK"] as Usage[] }) },
  { keys: ["pet", "çocuk", "cocuk", "evcil"], apply: () => ({ usages: ["PET_COCUK"] as Usage[] }) },
  { keys: ["ekonomik", "ucuz"], apply: () => ({ budget: "EKONOMIK" as Budget }) },
  { keys: ["standart"], apply: () => ({ budget: "STANDART" as Budget }) },
  { keys: ["premium", "lüks", "luks"], apply: () => ({ budget: "PREMIUM" as Budget }) },
];

export function parseCommand(text: string): ParsedCommand {
  const normalized = text.toLocaleLowerCase("tr-TR");
  const overrides: Partial<SpaceInput> = {};
  const matched: string[] = [];
  for (const rule of KEYWORDS) {
    if (rule.keys.some((k) => normalized.includes(k))) {
      Object.assign(overrides, rule.apply(normalized));
      matched.push(rule.keys[0]);
    }
  }
  return { overrides, matchedKeywords: matched };
}

export function applyCommand(base: SpaceInput, text?: string): SpaceInput {
  if (!text) return base;
  const { overrides } = parseCommand(text);
  return { ...base, ...overrides };
}

// ----------------------------------------------------------
// Deterministik mock görsel yerleşim (Visual AI fallback)
// ----------------------------------------------------------
const ZONE_COLORS: Record<Zone["id"], string> = {
  PLANTS: "#3f7d3a",
  SEEDS: "#8bc34a",
  IRRIGATION: "#2196f3",
  ACCESSORIES: "#e65100",
};

/**
 * Fotoğraf/komut üzerine LLM/Vision API olmadan da bir "yerleşim planı"
 * gösterilebilmesi için deterministik SVG üretir. Zone blokları alan yüzdesine
 * göre yerleştirilir (aynı girdi → aynı görsel).
 */
export function generateMockVisualLayout(zones: Zone[]): string {
  const width = 400;
  const height = 300;
  let x = 0;
  const rects: string[] = [];
  for (const z of zones) {
    const w = Math.round((width * z.areaPercent) / 100);
    rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="${ZONE_COLORS[z.id]}" opacity="0.75"/>`);
    rects.push(`<text x="${x + w / 2}" y="${height / 2}" fill="#fff" font-size="13" font-family="Arial" text-anchor="middle">${ZONE_LABELS[z.id].split("—")[1]?.trim() ?? z.id}</text>`);
    x += w;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#14100d"/>${rects.join("")}</svg>`;
}
