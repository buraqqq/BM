import { prisma } from "@/lib/prisma";
import { computeFinalPrice, type CampaignWithProducts } from "@/lib/pricing";

// ==========================================================
// FAZ 3.1 — Bölüm 1/2: "Fiyat: düşükten yükseğe / yüksekten düşüğe"
// sıralamasının GERÇEK satış fiyatına (kampanya/manuel indirim sonrası —
// final customer price) göre yapılması.
//
// ÖNEMLİİ MİMARİ KARAR: fiyat hesaplama mantığı burada İKİNCİ KEZ
// YAZILMADI — src/lib/pricing.ts'teki `computeFinalPrice` (tek doğruluk
// kaynağı) doğrudan çağrılıyor. Bu dosya yalnızca "hangi ürünlerin final
// fiyatının liste fiyatından FARKLI olabileceğini" belirleyip, o küçük
// alt kümeyi hesaplayıp, kalan (indirimsiz) çoğunluğu zaten SQL'in kendi
// ORDER BY price'ıyla sıralanmış halde çekerek ikisini birleştiriyor.
//
// NEDEN "TÜMÜNÜ ÇEK + JS'DE SIRALA" YAPILMADI (Bölüm 2 gereksinimi):
// final fiyat DB'de sorgulanabilir bir sütun değil (computeFinalPrice
// çalışma zamanında, aktif kampanyalara göre hesaplanıyor) — bu yüzden
// TAM anlamıyla SQL ORDER BY final_price mümkün değil, PostgreSQL'e
// geçilip ya materialized bir `effectivePrice` sütunu (kampanya/fiyat
// değişiminde senkron tutulan) ya da generated column eklenmeden temiz
// biçimde çözülemez (bkz. docs/catalog.md "Fiyat sıralama — gelecek"
// notu). Bu ise hem yeni bir servis/migration hem de "fiyat hesaplama
// mantığını ikinci kez yazma" yasağıyla çelişen bir SQL-seviyesi kampanya
// motoru gerektirirdi.
//
// GEÇİCİ (ama naif olmayan) ÇÖZÜM: indirimden etkilenebilecek ürünler
// yalnızca şunlardır: (a) salePrice dolu olanlar, (b) aktif bir PRODUCT
// kapsamlı kampanyanın hedeflediği ürünler, (c) aktif bir CATEGORY
// kapsamlı kampanyanın alt ağacındaki ürünler. Bu küme, gerçek kullanımda
// (hedefli, süreli kampanyalar) kataloğun tamamına göre KÜÇÜKTÜR — yalnızca
// bu küme için computeFinalPrice çalıştırılır. Geri kalan (etkilenmeyen)
// ürünler için final fiyat = liste fiyatı, bu yüzden SQL zaten doğru
// sırada getirir. İki sıralı listeyi birleştirmek (merge) için, SQL'den
// yalnızca `offset + pageSize + etkilenenSayısı` kadar satır istenir —
// kataloğun TAMAMI değil. Maliyet, mevcut sayfa derinliği + etkilenen küme
// büyüklüğüyle orantılı; toplam ürün sayısıyla DEĞİL.
//
// BİLİNEN, DOKÜMANTE EDİLMİŞ İSTİSNA — GLOBAL kapsamlı aktif kampanya:
// GLOBAL kampanya TANIMI gereği filtrelenmiş kümedeki HER ürünü etkiler,
// bu yüzden "etkilenen alt küme"yi küçük tutma stratejisi burada işlemez.
// Bu durumda filtrelenmiş kümenin tamamı (yalnızca 5 skaler alan, JOIN'siz
// — görsel/marka/kategori/envanter dahil edilmez) çekilip hesaplanır.
// Şu anki gerçek veride hiçbir GLOBAL kampanya yok (bkz. FAZ3.1 raporu);
// bu dal yalnızca doğruluk için var, birim testle kapsanıyor. 10.000+
// ürünlü bir katalogda GERÇEKTEN aktif bir GLOBAL kampanya varsa bu dal
// pahalıdır — kalıcı çözüm yine materialized effectivePrice sütunudur.
// ==========================================================

export type SortDirection = "asc" | "desc";

// price/compareAtPrice/salePrice Prisma.Decimal döner — computeFinalPrice
// bunları zaten Number() ile çeviriyor (bkz. src/lib/pricing.ts), burada
// yeniden tip tanımlamak yerine Parameters<typeof computeFinalPrice>[0] ile
// aynı tipi türetiyoruz — pricing.ts'in imzası değişirse burası da otomatik
// senkron kalır.
type MinimalProduct = Parameters<typeof computeFinalPrice>[0] & { name: string };

export interface ScoredId {
  id: string;
  finalPrice: number;
  name: string;
}

// Aşağıdaki üç fonksiyon (compareScored/toScored/mergeSortedScored) BİLEREK
// dışa açıldı ve hiçbiri Prisma'ya dokunmuyor — src/lib/__tests__/
// price-sort.test.ts bunları DB'siz, saf birim testlerle kapsıyor
// (Bölüm 3'teki 7 test senaryosu).
export function compareScored(a: ScoredId, b: ScoredId, direction: SortDirection): number {
  const priceDiff = direction === "asc" ? a.finalPrice - b.finalPrice : b.finalPrice - a.finalPrice;
  if (priceDiff !== 0) return priceDiff;
  // Test 7 — fiyatı eşit ürünler için deterministik ikincil sıralama:
  // isim (A-Z), birincil yön ne olursa olsun sabit.
  return a.name.localeCompare(b.name, "tr");
}

export function toScored(p: MinimalProduct, activeCampaigns: CampaignWithProducts[]): ScoredId {
  const breakdown = computeFinalPrice(p, activeCampaigns);
  return { id: p.id, name: p.name, finalPrice: breakdown.finalPrice };
}

/** İki zaten-sıralı ScoredId dizisini `direction`e göre birleştirir (klasik iki işaretçili merge). */
export function mergeSortedScored(a: ScoredId[], b: ScoredId[], direction: SortDirection): ScoredId[] {
  const merged: ScoredId[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    merged.push(compareScored(a[i], b[j], direction) <= 0 ? a[i++] : b[j++]);
  }
  while (i < a.length) merged.push(a[i++]);
  while (j < b.length) merged.push(b[j++]);
  return merged;
}

const MINIMAL_SELECT = { id: true, name: true, categoryId: true, price: true, compareAtPrice: true, salePrice: true } as const;

async function resolveAffectedProductIds(
  where: Record<string, unknown>,
  activeCampaigns: CampaignWithProducts[]
): Promise<{ ids: Set<string>; hasGlobalCampaign: boolean }> {
  const hasGlobalCampaign = activeCampaigns.some((c) => c.scope === "GLOBAL");
  if (hasGlobalCampaign) return { ids: new Set(), hasGlobalCampaign: true };

  const ids = new Set<string>();

  const saleRows = await prisma.product.findMany({ where: { ...where, salePrice: { not: null } }, select: { id: true } });
  saleRows.forEach((r) => ids.add(r.id));

  for (const campaign of activeCampaigns) {
    if (campaign.scope === "PRODUCT") {
      campaign.products.forEach((cp) => ids.add(cp.productId));
    } else if (campaign.scope === "CATEGORY" && campaign.categorySubtreeIds) {
      const rows = await prisma.product.findMany({
        where: { ...where, categoryId: { in: campaign.categorySubtreeIds } },
        select: { id: true },
      });
      rows.forEach((r) => ids.add(r.id));
    }
  }

  return { ids, hasGlobalCampaign: false };
}

export interface FinalPriceSortPage {
  /** Sayfa için, final fiyata göre doğru sırada ürün id listesi (pageSize kadar veya daha az — son sayfa). */
  orderedIds: string[];
  total: number;
}

/**
 * Bir WHERE'e uyan ürünleri GERÇEK satış (final) fiyatına göre sıralayıp
 * sayfalar. Yalnızca id döner — çağıran, bu id'lerle ikinci (küçük, yalnızca
 * o sayfa kadar) bir `findMany({ include: {...} })` yaparak tam veriyi
 * hydrate eder (bkz. src/app/api/products/route.ts).
 */
export async function getFinalPriceSortedPage(
  where: Record<string, unknown>,
  direction: SortDirection,
  page: number,
  pageSize: number,
  activeCampaigns: CampaignWithProducts[]
): Promise<FinalPriceSortPage> {
  const total = await prisma.product.count({ where });
  const offset = (page - 1) * pageSize;

  const { ids: affectedIds, hasGlobalCampaign } = await resolveAffectedProductIds(where, activeCampaigns);

  if (hasGlobalCampaign) {
    // Dokümante edilmiş istisna — bkz. dosya başlığı. Yalnızca skaler
    // alanlar, ilişki JOIN'i yok.
    const all = await prisma.product.findMany({ where, select: MINIMAL_SELECT });
    const scored = all.map((p) => toScored(p, activeCampaigns)).sort((a, b) => compareScored(a, b, direction));
    return { orderedIds: scored.slice(offset, offset + pageSize).map((s) => s.id), total };
  }

  if (affectedIds.size === 0) {
    // Hiçbir ürün indirimden etkilenmiyor — final fiyat === liste fiyatı,
    // SQL'in kendi ORDER BY price'ı zaten doğru. Kataloğun tamamına
    // dokunulmadan, doğrudan sayfalanmış sonuç.
    const rows = await prisma.product.findMany({
      where,
      select: { id: true },
      orderBy: [{ price: direction }, { name: "asc" }],
      skip: offset,
      take: pageSize,
    });
    return { orderedIds: rows.map((r) => r.id), total };
  }

  const affectedRows = await prisma.product.findMany({ where: { id: { in: [...affectedIds] } }, select: MINIMAL_SELECT });
  const affectedScored = affectedRows.map((p) => toScored(p, activeCampaigns)).sort((a, b) => compareScored(a, b, direction));

  // Etkilenmeyen çoğunluk için, bu sayfayı doğru üretmeye yetecek kadarını
  // (offset + pageSize + etkilenen sayısı) SQL'den, zaten sıralı halde
  // çekiyoruz — kataloğun tamamını DEĞİL.
  const unaffectedNeeded = offset + pageSize + affectedIds.size;
  const unaffectedRows = await prisma.product.findMany({
    where: { ...where, id: { notIn: [...affectedIds] } },
    select: { id: true, name: true, price: true },
    orderBy: [{ price: direction }, { name: "asc" }],
    take: unaffectedNeeded,
  });
  const unaffectedScored: ScoredId[] = unaffectedRows.map((r) => ({ id: r.id, name: r.name, finalPrice: Number(r.price) }));

  // İki (zaten sıralı) diziyi birleştir — O(affected + unaffectedNeeded),
  // kataloğun tamamı değil (bkz. mergeSortedScored, birim testli).
  const merged = mergeSortedScored(affectedScored, unaffectedScored, direction);

  return { orderedIds: merged.slice(offset, offset + pageSize).map((s) => s.id), total };
}
