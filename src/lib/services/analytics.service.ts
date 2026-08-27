// ==========================================================
// FAZ 7 — Affiliate Analytics servisi (Prisma + SQLite uyarlaması).
//
// Orijinal taslak Supabase (`@/lib/supabase/admin`) kullanıyordu — bu proje
// Supabase DEĞİL; Prisma + SQLite kullanır. Bu nedenle servis `prisma` ile,
// AuditLog tablosu üzerinden çalışır (tıklamalar zaten redirect route'unda
// action="AFFILIATE_CLICK" olarak kaydediliyor).
//
// DÜRÜSTLÜK: `matchSuccessRate` sahte 100 DEĞİL — tasarım loglarından
// (AI_DESIGN_GENERATED) iç-eşleşme / toplam kalem oranı olarak hesaplanır;
// veri yoksa null döner. Saf hesaplama fonksiyonu ayrı tutuldu (birim testli).
// ==========================================================
import { prisma } from "@/lib/prisma";

export interface AffiliateMetrics {
  totalClicks: number;
  topMerchant: string;
  matchSuccessRate: number | null;
  clicksByDay: { date: string; count: number }[];
}

interface RawLogRow {
  action: string;
  metadataJson: string | null;
  createdAt: Date;
}

function parseMeta(metadataJson: string | null): Record<string, unknown> | null {
  if (!metadataJson) return null;
  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return null; // bozuk metadata güvenle atlanır
  }
}

/** SAF hesaplama — ham satırlardan metrikleri üretir (birim testli). */
export function computeAffiliateMetrics(logs: RawLogRow[]): AffiliateMetrics {
  const merchantCounts: Record<string, number> = {};
  const dateCounts: Record<string, number> = {};
  let totalClicks = 0;

  for (const log of logs) {
    if (log.action !== "AFFILIATE_CLICK") continue;
    totalClicks++;
    const meta = parseMeta(log.metadataJson);
    const merchant = (meta?.vendor as string) ?? (meta?.merchant as string) ?? "unknown";
    merchantCounts[merchant] = (merchantCounts[merchant] ?? 0) + 1;
    const date = log.createdAt.toISOString().split("T")[0];
    dateCounts[date] = (dateCounts[date] ?? 0) + 1;
  }

  const topMerchant = Object.entries(merchantCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";
  const clicksByDay = Object.entries(dateCounts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

  // BOM match başarı oranı: tasarım loglarından gerçek iç-eşleşme oranı.
  let matchedInternal = 0;
  let totalItems = 0;
  for (const log of logs) {
    if (log.action !== "AI_DESIGN_GENERATED") continue;
    const meta = parseMeta(log.metadataJson);
    if (!meta) continue;
    const internal = Number(meta.internalCount ?? 0);
    const affiliate = Number(meta.affiliateCount ?? 0);
    matchedInternal += internal;
    totalItems += internal + affiliate;
  }
  const matchSuccessRate = totalItems > 0 ? Math.round((matchedInternal / totalItems) * 100) : null;

  return { totalClicks, topMerchant, matchSuccessRate, clicksByDay };
}

/** DB'den son N günün affiliate + tasarım loglarını çekip metrikleri döner. */
export async function getAffiliateAnalytics(timeframeDays = 30): Promise<AffiliateMetrics> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeframeDays);

  const logs = await prisma.auditLog.findMany({
    where: { action: { in: ["AFFILIATE_CLICK", "AI_DESIGN_GENERATED"] }, createdAt: { gte: startDate } },
    select: { action: true, metadataJson: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return computeAffiliateMetrics(logs);
}
