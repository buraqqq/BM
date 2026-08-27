import { prisma } from "@/lib/prisma";

// ==========================================================
// FAZ 11 — Admin Analytics servisi (Prisma + SQLite).
//
// Sistem metriklerini toplayan SAF (DB'siz) hesaplama fonksiyonları + bunları
// Prisma üzerinden besleyen ince DB wrapper'lar. Mevcut desenle aynı
// (bkz. src/lib/services/analytics.service.ts: saf compute + prisma wrapper).
//
// DÜRÜSTLÜK:
// - Alarm durum dağılımı gerçek şemadan türetilir: `status=CANCELLED` →
//   CANCELLED, aksi halde `isTriggered=false` → PENDING, `isTriggered=true` →
//   TRIGGERED. İptal artık soft-cancel'dir (bkz. alert-service.ts cancelAlert),
//   bu yüzden CANCELLED sayısı gerçek veriden gelir, uydurma değildir.
// - Bildirim başarı oranı AuditLog'daki "ALERT_TRIGGERED" kayıtlarının
//   metadata.delivered alanından hesaplanır; veri yoksa null döner.
// ==========================================================

// ----------------------------------------------------------
// Tipler
// ----------------------------------------------------------

export interface AlertTypeCounts {
  STOCK_RESTOCK: number;
  PRICE_DROP: number;
  BACK_IN_STOCK: number;
}

export interface AlertStatusCounts {
  pending: number;
  triggered: number;
  cancelled: number;
}

export interface AlertStats {
  total: number;
  byType: AlertTypeCounts;
  byStatus: AlertStatusCounts;
}

export interface TopAlertedProduct {
  productId: string;
  productName: string;
  productSlug: string;
  alertCount: number;
}

export interface NotificationStats {
  delivered: number;
  failed: number;
  /** delivered / (delivered+failed) yüzdesi; toplam 0 ise null. */
  successRate: number | null;
}

export interface AdminAnalytics {
  alerts: AlertStats;
  topAlertedProducts: TopAlertedProduct[];
  notifications: NotificationStats;
}

// ----------------------------------------------------------
// SAF hesaplama fonksiyonları (birim testli, DB'siz)
// ----------------------------------------------------------

const ALERT_TYPE_KEYS = ["STOCK_RESTOCK", "PRICE_DROP", "BACK_IN_STOCK"] as const;

/** Ham alarm satırlarından toplam + tip/durum dağılımı üretir. */
export function computeAlertStats(rows: { alertType: string; isTriggered: boolean; status: string }[]): AlertStats {
  const byType: AlertTypeCounts = { STOCK_RESTOCK: 0, PRICE_DROP: 0, BACK_IN_STOCK: 0 };
  const byStatus: AlertStatusCounts = { pending: 0, triggered: 0, cancelled: 0 };

  for (const row of rows) {
    if ((ALERT_TYPE_KEYS as readonly string[]).includes(row.alertType)) {
      byType[row.alertType as keyof AlertTypeCounts] += 1;
    }
    if (row.status === "CANCELLED") byStatus.cancelled += 1;
    else if (row.isTriggered) byStatus.triggered += 1;
    else byStatus.pending += 1;
  }

  return { total: rows.length, byType, byStatus };
}

/** productId'ye göre gruplayıp en çok alarm kurulan ürünleri sıralar. */
export function computeTopAlertedProducts(
  rows: { productId: string }[],
  limit: number
): { productId: string; alertCount: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.productId, (counts.get(row.productId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([productId, alertCount]) => ({ productId, alertCount }))
    .sort((a, b) => b.alertCount - a.alertCount)
    .slice(0, Math.max(0, limit));
}

/** ALERT_TRIGGERED log kayıtlarından teslimat başarı oranı hesaplar. */
export function computeNotificationStats(logs: { metadataJson: string | null }[]): NotificationStats {
  let delivered = 0;
  let failed = 0;
  for (const log of logs) {
    if (!log.metadataJson) {
      failed += 1; // metadata yoksa teslimat durumu bilinmiyor → başarısız say
      continue;
    }
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(log.metadataJson) as Record<string, unknown>;
    } catch {
      failed += 1; // bozuk metadata güvenle başarısız sayılır
      continue;
    }
    if (meta.delivered === true) delivered += 1;
    else failed += 1;
  }
  const total = delivered + failed;
  const successRate = total > 0 ? Math.round((delivered / total) * 100) : null;
  return { delivered, failed, successRate };
}

// ----------------------------------------------------------
// DB wrapper'ları
// ----------------------------------------------------------

/** Toplam alarm sayısı + tip/durum dağılımı. */
export async function getAlertStats(): Promise<AlertStats> {
  const rows = await prisma.productAlert.findMany({
    select: { alertType: true, isTriggered: true, status: true },
  });
  return computeAlertStats(rows);
}

/** En çok alarm kurulan ürünler (ürün adı/slug ile birlikte). */
export async function getTopAlertedProducts(limit = 5): Promise<TopAlertedProduct[]> {
  const rows = await prisma.productAlert.findMany({ select: { productId: true } });
  const top = computeTopAlertedProducts(rows, limit);

  if (top.length === 0) return [];

  const productIds = top.map((t) => t.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, slug: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  // Silinmiş ürün referansları (FK Cascade nedeniyle normalde olmaz) güvenle atlanır.
  return top.flatMap((t) => {
    const p = productById.get(t.productId);
    if (!p) return [];
    return [{ productId: p.id, productName: p.name, productSlug: p.slug, alertCount: t.alertCount }];
  });
}

/** E-posta bildirim teslimat başarı oranı (AuditLog ALERT_TRIGGERED). */
export async function getNotificationStats(): Promise<NotificationStats> {
  const logs = await prisma.auditLog.findMany({
    where: { action: "ALERT_TRIGGERED" },
    select: { metadataJson: true },
  });
  return computeNotificationStats(logs);
}

/** Admin analitik özeti — üç metriği tek çağrıda toplar. */
export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const [alerts, topAlertedProducts, notifications] = await Promise.all([
    getAlertStats(),
    getTopAlertedProducts(5),
    getNotificationStats(),
  ]);
  return { alerts, topAlertedProducts, notifications };
}
