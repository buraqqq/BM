// ==========================================================
// FAZ 7 — Affiliate yönlendirme & Outbound Click Tracking yardımcıları.
// SAF fonksiyonlar: dış linke UTM + ref (takip kodu) ekler; tıklama kaydı
// redirect route'unda (src/app/api/affiliate/redirect) AuditLog üzerinden
// tutulur (yeni tablo YOK — mevcut genel audit şeması yeniden kullanılır).
// ==========================================================

export const AFFILIATE_UTM = {
  source: "bmvourla",
  medium: "affiliate",
  campaign: "ai-garden-designer",
} as const;

/** Deterministik kısa takip kodu (djb2 hash benzeri) — aynı ürün için sabit. */
export function generateTrackingCode(affiliateProductId: string): string {
  let h = 5381;
  for (let i = 0; i < affiliateProductId.length; i++) {
    h = ((h << 5) + h + affiliateProductId.charCodeAt(i)) >>> 0;
  }
  return `bm${h.toString(36).padStart(6, "0")}`;
}

/** Dış affiliate URL'ine UTM + ref parametrelerini ekler (mevcut query korunur). */
export function buildAffiliateUrl(baseUrl: string, trackingCode: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", AFFILIATE_UTM.source);
  url.searchParams.set("utm_medium", AFFILIATE_UTM.medium);
  url.searchParams.set("utm_campaign", AFFILIATE_UTM.campaign);
  url.searchParams.set("utm_content", trackingCode);
  url.searchParams.set("ref", trackingCode);
  return url.toString();
}

/** UI'nın affiliate ürüne vereceği iç yönlendirme yolu (tıklama kaydı burada olur). */
export function buildRedirectPath(affiliateProductId: string): string {
  return `/api/affiliate/redirect?id=${encodeURIComponent(affiliateProductId)}`;
}
