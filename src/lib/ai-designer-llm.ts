// ==========================================================
// FAZ 5 — AI Garden Designer: LLM entegrasyon SOYUTLAMASI + deterministic
// fallback.
//
// Bu katman, "AI'ı bugün kodlamadan, AI'ı yarın kolaylaştıracak temelleri
// kurma" ilkesiyle tasarlandı (bkz. docs/future-ai-architecture.md): gerçek
// bir Claude/Gemini çağrısı HENÜZ bağlanmadı (sağlayıcı seçimi + API key
// kullanıcının onayına bağlı), ama bu dosya o entegrasyonun tek değişiklik
// noktasıdır. `AI_PROVIDER`/`AI_API_KEY` env'i sağlandığında buradaki tek
// fonksiyonun gövdesi LLM çağrısına bağlanır; çağıran kod (route) DEĞİŞMEZ.
//
// KESİN GARANTİ: API key yoksa / kota biterse / LLM hata verirse uygulama
// ÇÖKMEZ — deterministik kural-tabanlı motor (ai-designer-logic.ts) devreye
// girer. Bu nedenle "rule-based" her zaman çalışan varsayılan yoldur.
// ==========================================================

import {
  generateDesign,
  type SpaceInput,
  type InternalProductRef,
  type AffiliateRef,
  type DesignResult,
} from "@/lib/ai-designer-logic";

export type DesignSource = "rule-based" | "llm";

export interface DesignEngineOutput {
  source: DesignSource;
  result: DesignResult;
}

/**
 * Tasarımı üretir. LLM yapılandırılmışsa (AI_PROVIDER + AI_API_KEY) onu
 * dener; değilse — ve LLM herhangi bir nedenle başarısız olursa — deterministik
 * kural-tabanlı motora düşer. Şu an LLM entegrasyonu bilinçli olarak bağlanmadı
 * (bkz. dosya başlığı), bu yüzden her zaman `source: "rule-based"` döner.
 */
export async function generateDesignWithFallback(
  input: SpaceInput,
  internalProducts: InternalProductRef[],
  affiliateProducts: AffiliateRef[]
): Promise<DesignEngineOutput> {
  const provider = process.env.AI_PROVIDER; // "claude" | "gemini" (gelecekte)
  const apiKey = process.env.AI_API_KEY;

  if (provider && apiKey) {
    // TODO(FAZ 5): Gerçek LLM çağrısı buraya bağlanacak. Prompt, `input` +
    // katalog özetinden kurulur; yanıt yine DesignResult şekline normalize
    // edilir. LLM hata verirse aşağıdaki fallback'e düşülür (try/catch).
  }

  return {
    source: "rule-based",
    result: generateDesign(input, internalProducts, affiliateProducts),
  };
}
