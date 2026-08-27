import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateDesignWithFallback,
  resolveProvider,
  clearDesignCache,
  type LlmEnv,
} from "@/lib/ai-designer-llm";
import { generateMockVisualLayout } from "@/lib/ai-designer-inputs";
import { generateZones, type SpaceInput, type InternalProductRef, type AffiliateRef } from "@/lib/ai-designer-logic";

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

const INTERNAL: InternalProductRef[] = [];
const AFFILIATE: AffiliateRef[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  clearDesignCache();
});

describe("ai-designer-llm — sağlayıcı seçimi", () => {
  it("anahtar yoksa null döner", () => {
    expect(resolveProvider({})).toBeNull();
  });

  it("öncelik sırası: openai > deepseek > gemini > anthropic", () => {
    const env: LlmEnv = { OPENAI_API_KEY: "a", DEEPSEEK_API_KEY: "b", GEMINI_API_KEY: "c", ANTHROPIC_API_KEY: "d" };
    expect(resolveProvider(env)).toBe("openai");
    expect(resolveProvider({ DEEPSEEK_API_KEY: "b" })).toBe("deepseek");
    expect(resolveProvider({ GEMINI_API_KEY: "c" })).toBe("gemini");
    expect(resolveProvider({ ANTHROPIC_API_KEY: "d" })).toBe("anthropic");
  });
});

describe("ai-designer-llm — canlı yol + failover", () => {
  function mockOpenAi(content: unknown) {
    const body = JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => JSON.parse(body) })));
  }

  it("anahtar yoksa LLM çağrısı YAPMADAN rule-based'e düşer", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateDesignWithFallback(BASE_INPUT, INTERNAL, AFFILIATE, { env: {} });
    expect(out.source).toBe("rule-based");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("geçerli LLM çıktısı source=llm üretir", async () => {
    mockOpenAi({
      zones: [
        { id: "PLANTS", title: "Bitkiler", areaPercent: 25, areaSqm: 3 },
        { id: "SEEDS", title: "Tohum", areaPercent: 25, areaSqm: 3 },
        { id: "IRRIGATION", title: "Sulama", areaPercent: 25, areaSqm: 3 },
        { id: "ACCESSORIES", title: "Aksesuar", areaPercent: 25, areaSqm: 3 },
      ],
      bom: [{ kind: "bitki", label: "Bitki", quantity: 3, unit: "adet" }],
    });
    const out = await generateDesignWithFallback(BASE_INPUT, INTERNAL, AFFILIATE, { env: { OPENAI_API_KEY: "test" } });
    expect(out.source).toBe("llm");
    expect(out.result.zones.map((z) => z.id)).toEqual(["PLANTS", "SEEDS", "IRRIGATION", "ACCESSORIES"]);
  });

  it("geçersiz zone id'si (pipe'lı string) rule-based'e düşer — çökmez", async () => {
    // FAZ 6 regresyonu: LLM prompt'taki "PLANTS|SEEDS|..." örneğini aynen kopyalayıp
    // geçersiz id döndürüyordu; enum doğrulaması olmadığı için ZONE_LABELS[id] undefined
    // olup .split() çöküyordu. Artık geçersiz çıktı safeParse'i geçemeyip fallback'e düşer.
    mockOpenAi({
      zones: [
        { id: "PLANTS|SEEDS|IRRIGATION|ACCESSORIES", title: "Yeşil Alan", areaPercent: 25, areaSqm: 3 },
        { id: "FURNITURE|LIGHTING", title: "Dinlenme", areaPercent: 50, areaSqm: 6 },
        { id: "ACCESSORIES", title: "Dekor", areaPercent: 15, areaSqm: 1.8 },
        { id: "IRRIGATION", title: "Sulama", areaPercent: 10, areaSqm: 1.2 },
      ],
      bom: [{ kind: "bitki", label: "Sukulent", quantity: 3, unit: "adet" }],
    });
    const out = await generateDesignWithFallback(BASE_INPUT, INTERNAL, AFFILIATE, { env: { OPENAI_API_KEY: "test" } });
    expect(out.source).toBe("rule-based");
  });

  it("ağ hatasında rule-based'e düşer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const out = await generateDesignWithFallback(BASE_INPUT, INTERNAL, AFFILIATE, { env: { OPENAI_API_KEY: "test" } });
    expect(out.source).toBe("rule-based");
  });
});

describe("ai-designer-llm — görsel yerleşim bilinmeyen id'ye dayanıklı", () => {
  it("tanımsız ZONE_LABELS id'sinde çökmez", () => {
    const zones = generateZones(BASE_INPUT);
    // Geçersiz id enjekte et (tipi bypass) — render fonksiyonu çökmemeli.
    const broken = zones.map((z, i) => (i === 0 ? { ...z, id: "BOGUS" as typeof z.id } : z));
    const svg = generateMockVisualLayout(broken);
    expect(svg).toContain("<svg");
    expect(svg).toContain("BOGUS");
  });
});
