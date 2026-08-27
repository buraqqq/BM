// ==========================================================
// FAZ 6 — Canlı LLM & Vision entegrasyonu (4 sağlayıcı).
//
// Dinamik sağlayıcı seçimi (öncelik sırası):
//   OPENAI_API_KEY   → OpenAI  (gpt-4o-mini, response_format json_object)
//   DEEPSEEK_API_KEY → DeepSeek (deepseek-chat, OpenAI-uyumlu uç)
//   GEMINI_API_KEY   → Gemini  (generativelanguage, responseMimeType json)
//   ANTHROPIC_API_KEY→ Claude  (claude-3-5-sonnet)
// Anahtar YOKSA veya herhangi bir hata (ağ/timeout/geçersiz JSON) → KUSURSUZ
// rule-based fallback (asla throw/null yok). LLM yalnızca zones+BOM üretir;
// eşleştirme/maliyet/rehber her zaman deterministik motordan gelir.
// Maliyet koruması: in-memory cache, 15s timeout, 800 max token.
// ==========================================================
import { z } from "zod";
import {
  generateDesign,
  computeArea,
  buildCareGuide,
  matchBomToCatalog,
  computeCostCard,
  buildZonesFromLayout,
  generateDesignWithZones,
  reviseZonePercent,
  type ZoneLayoutItem,
  type SpaceInput,
  type InternalProductRef,
  type AffiliateRef,
  type DesignResult,
  type BomItem,
  type Zone,
  type ZoneId,
} from "@/lib/ai-designer-logic";

export type DesignSource = "rule-based" | "llm";
export type LlmProvider = "openai" | "deepseek" | "gemini" | "anthropic";

export interface LlmEnv {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
  DEEPSEEK_MODEL?: string;
  GEMINI_MODEL?: string;
}

export interface DesignEngineOutput { source: DesignSource; result: DesignResult; }
export interface DesignEngineOptions { photoDataUrl?: string; env?: LlmEnv; }

export function resolveProvider(env: LlmEnv): LlmProvider | null {
  if (env.OPENAI_API_KEY) return "openai";
  if (env.DEEPSEEK_API_KEY) return "deepseek";
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

// ---- Strict JSON şeması (LLM çıktısı zod ile doğrulanır) ----
const llmZoneSchema = z.object({
  id: z.enum(["PLANTS", "SEEDS", "IRRIGATION", "ACCESSORIES"]),
  title: z.string().min(1),
  areaPercent: z.number().min(0).max(100),
  areaSqm: z.number().min(0),
});
const llmBomItemSchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string().min(1),
  note: z.string().optional(),
});
const llmDesignSchema = z.object({
  zones: z.array(llmZoneSchema).min(1),
  bom: z.array(llmBomItemSchema).min(1),
});

// ---- Maliyet & kota koruması ----
const LLM_TIMEOUT_MS = 15000;
const LLM_MAX_TOKENS = 800;
const CACHE_MAX_ENTRIES = 100;
const cache = new Map<string, DesignEngineOutput>();

export function buildCacheKey(input: SpaceInput, photoDataUrl?: string): string {
  return JSON.stringify([input, photoDataUrl ? `${photoDataUrl.length}:${photoDataUrl.slice(0, 64)}` : null]);
}
export function clearDesignCache(): void { cache.clear(); }
export function getDesignCacheSize(): number { return cache.size; }

function cacheSet(key: string, value: DesignEngineOutput): void {
  cache.set(key, value);
  if (cache.size > CACHE_MAX_ENTRIES) {
    const first = cache.keys().next().value as string;
    cache.delete(first);
  }
}

function buildPrompt(input: SpaceInput): string {
  return [
    "Sen bir peyzaj mimarısın. Verilen alanı tam 4 bölgeye ayır ve ihtiyaç listesi üret.",
    "Her bölgenin 'id' alanı YALNIZCA şu dört değerden biri olmalı: PLANTS, SEEDS, IRRIGATION, ACCESSORIES (başka değer KULLANMA).",
    "YALNIZCA şu şemada JSON döndür (başka metin YAZMA):",
    '{"zones":[{"id":"PLANTS","title":"...","areaPercent":25,"areaSqm":3.0}],"bom":[{"kind":"bitki","label":"...","quantity":5,"unit":"adet","note":"..."}]}',
    "Dört bölgenin 'id' değerleri PLANTS, SEEDS, IRRIGATION, ACCESSORIES olarak birer kez geçmeli ve zone yüzdelerinin toplamı 100 olmalı.",
    `Girdi: ${JSON.stringify({ spaceType: input.spaceType, areaSqm: computeArea(input), facade: input.facade, light: input.light, climate: input.climate, windExposed: input.windExposed, usages: input.usages, budget: input.budget })}`,
  ].join("\n");
}

// ---- OpenAI / DeepSeek (OpenAI-uyumlu) ----
async function callOpenAiCompatible(apiKey: string, baseUrl: string, model: string, prompt: string, photoDataUrl?: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const content: unknown[] = [{ type: "text", text: prompt }];
    if (photoDataUrl) content.push({ type: "image_url", image_url: { url: photoDataUrl } });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: LLM_MAX_TOKENS, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${model} ${res.status}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return JSON.parse(json.choices[0].message.content);
  } finally {
    clearTimeout(timer);
  }
}

// ---- Gemini ----
async function callGemini(apiKey: string, model: string, prompt: string, photoDataUrl?: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const parts: unknown[] = [{ text: prompt }];
    if (photoDataUrl) {
      const m = photoDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: LLM_MAX_TOKENS, responseMimeType: "application/json" } }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const json = (await res.json()) as { candidates: { content: { parts: { text?: string }[] } }[] };
    const text = (json.candidates[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// ---- Anthropic ----
async function callAnthropic(apiKey: string, model: string, prompt: string, photoDataUrl?: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const content: unknown[] = [{ type: "text", text: prompt }];
    if (photoDataUrl) {
      const m = photoDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: LLM_MAX_TOKENS, messages: [{ role: "user", content }] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    return JSON.parse(json.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""));
  } finally {
    clearTimeout(timer);
  }
}

// ---- LLM çıktısı → DesignResult (eşleştirme deterministik motordan) ----
function assembleFromLlm(input: SpaceInput, internal: InternalProductRef[], affiliate: AffiliateRef[], data: z.infer<typeof llmDesignSchema>): DesignEngineOutput {
  const zones: Zone[] = data.zones.map((z) => ({
    id: z.id as ZoneId,
    title: z.title,
    description: "",
    areaPercent: z.areaPercent,
    areaSqm: z.areaSqm,
  }));
  const bom = data.bom as BomItem[];
  const items = matchBomToCatalog(bom, internal, affiliate);
  return {
    source: "llm",
    result: { areaSqm: computeArea(input), zones, bom, items, careGuide: buildCareGuide(input), cost: computeCostCard(items) },
  };
}

// ---- Ana fonksiyon: LLM dener, her hatada rule-based'e düşer ----
export async function generateDesignWithFallback(
  input: SpaceInput,
  internalProducts: InternalProductRef[],
  affiliateProducts: AffiliateRef[],
  opts?: DesignEngineOptions
): Promise<DesignEngineOutput> {
  const cacheKey = buildCacheKey(input, opts?.photoDataUrl);
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const env = opts?.env ?? (process.env as LlmEnv);
  const provider = resolveProvider(env);

  if (provider) {
    try {
      let raw: unknown;
      if (provider === "openai") raw = await callOpenAiCompatible(env.OPENAI_API_KEY!, "https://api.openai.com/v1/chat/completions", env.OPENAI_MODEL ?? "gpt-4o-mini", buildPrompt(input), opts?.photoDataUrl);
      else if (provider === "deepseek") raw = await callOpenAiCompatible(env.DEEPSEEK_API_KEY!, "https://api.deepseek.com/chat/completions", env.DEEPSEEK_MODEL ?? "deepseek-chat", buildPrompt(input), opts?.photoDataUrl);
      else if (provider === "gemini") raw = await callGemini(env.GEMINI_API_KEY!, env.GEMINI_MODEL ?? "gemini-2.0-flash", buildPrompt(input), opts?.photoDataUrl);
      else raw = await callAnthropic(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest", buildPrompt(input), opts?.photoDataUrl);

      const parsed = llmDesignSchema.safeParse(raw);
      if (parsed.success) {
        const output = assembleFromLlm(input, internalProducts, affiliateProducts, parsed.data);
        cacheSet(cacheKey, output);
        return output;
      }
      // geçersiz format → fallback
    } catch {
      // ağ/timeout/parse hatası → fallback
    }
  }

  const output: DesignEngineOutput = { source: "rule-based", result: generateDesign(input, internalProducts, affiliateProducts) };
  cacheSet(cacheKey, output);
  return output;
}


// ==========================================================
// FAZ 12 — Nokta revize (numaralı tek bölgeyi hedefleme).
//
// Kullanıcı tüm tasarımı baştan yapmak yerine NUMARALI bir bölgeyi (Zone A/B/C/D)
// hedefler ve yalnızca o bölgeyi revize eder. LLM hedef bölgenin yüzdesini
// kullanıcının isteğine göre ayarlar (ve tüm bölgelerin yüzdelerini 100'e
// normalize eder). Herhangi bir hata/anahtar yokluğu → deterministik
// reviseZonePercent fallback. Eşleştirme/maliyet her zaman deterministik
// motordan gelir (generateDesignWithZones).
// ==========================================================

const llmReviseZoneSchema = z.object({
  id: z.enum(["PLANTS", "SEEDS", "IRRIGATION", "ACCESSORIES"]),
  areaPercent: z.number().min(0).max(100),
});

const llmReviseSchema = z.object({
  zones: z.array(llmReviseZoneSchema).min(1).max(8),
});

function buildRevisePrompt(input: SpaceInput, currentZones: Zone[], targetZone: ZoneId, instruction: string): string {
  return [
    "Sen bir peyzaj mimarısın. Mevcut bir bahçe tasarımının YALNIZCA bir bölgesini revize edeceksin (diğer bölgeleri bozma).",
    `Hedef bölge id: ${targetZone}. Kullanıcı isteği: ${instruction}`,
    `Mevcut bölgeler (id + areaPercent): ${JSON.stringify(currentZones.map((z) => ({ id: z.id, areaPercent: z.areaPercent })))}`,
    "Yalnızca JSON döndür. TÜM 4 bölgeyi (PLANTS, SEEDS, IRRIGATION, ACCESSORIES) güncellenmiş areaPercent değerleriyle döndür; toplam 100 olmalı.",
    "Hedef bölgenin yüzdesini kullanıcının isteğine göre değiştir; diğer bölgeleri orantılı tut.",
    '{"zones":[{"id":"PLANTS","areaPercent":30},{"id":"SEEDS","areaPercent":15},{"id":"IRRIGATION","areaPercent":25},{"id":"ACCESSORIES","areaPercent":30}]}',
  ].join("\n");
}

function buildRevisedLayout(currentZones: Zone[], llmZones: { id: ZoneId; areaPercent: number }[]): ZoneLayoutItem[] {
  const seen = new Set<ZoneId>();
  const layout: ZoneLayoutItem[] = [];
  for (const z of llmZones) {
    layout.push({ id: z.id, areaPercent: z.areaPercent });
    seen.add(z.id);
  }
  // LLM eksik bölge döndürdüyse mevcut yüzdeyle tamamla.
  for (const z of currentZones) {
    if (!seen.has(z.id)) layout.push({ id: z.id, areaPercent: z.areaPercent });
  }
  return layout;
}

/** Hedef bölgeyi kullanıcı isteğine göre revize eder; LLM dener, fallback deterministik. */
export async function reviseZoneWithFallback(
  input: SpaceInput,
  currentZones: Zone[],
  targetZone: ZoneId,
  instruction: string,
  internalProducts: InternalProductRef[],
  affiliateProducts: AffiliateRef[],
  opts?: DesignEngineOptions
): Promise<DesignEngineOutput> {
  const env = opts?.env ?? (process.env as LlmEnv);
  const provider = resolveProvider(env);

  if (provider) {
    try {
      let raw: unknown;
      const prompt = buildRevisePrompt(input, currentZones, targetZone, instruction);
      if (provider === "openai") raw = await callOpenAiCompatible(env.OPENAI_API_KEY!, "https://api.openai.com/v1/chat/completions", env.OPENAI_MODEL ?? "gpt-4o-mini", prompt);
      else if (provider === "deepseek") raw = await callOpenAiCompatible(env.DEEPSEEK_API_KEY!, "https://api.deepseek.com/chat/completions", env.DEEPSEEK_MODEL ?? "deepseek-chat", prompt);
      else if (provider === "gemini") raw = await callGemini(env.GEMINI_API_KEY!, env.GEMINI_MODEL ?? "gemini-2.0-flash", prompt);
      else raw = await callAnthropic(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest", prompt);

      const parsed = llmReviseSchema.safeParse(raw);
      if (parsed.success) {
        const layout = buildRevisedLayout(currentZones, parsed.data.zones as { id: ZoneId; areaPercent: number }[]);
        const zones = buildZonesFromLayout(input, layout);
        const result = generateDesignWithZones(input, zones, internalProducts, affiliateProducts);
        return { source: "llm", result };
      }
    } catch {
      // ağ/timeout/parse hatası → deterministik fallback
    }
  }

  const revisedZones = reviseZonePercent(currentZones, targetZone, instruction);
  const result = generateDesignWithZones(input, revisedZones, internalProducts, affiliateProducts);
  return { source: "rule-based", result };
}