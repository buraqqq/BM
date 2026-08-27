import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ALERT_TYPES } from "@/lib/enums";
import { computeFinalPrice, getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { writeAuditLog } from "@/lib/audit";
import { buildAlertEmail, resolveProvider } from "@/lib/email-service";
import type { Product, ProductAlert } from "@prisma/client";

// ==========================================================
// FAZ 9 — Stok & Fiyat Alarmları (Adım 1).
//
// Saf (DB'siz) tetikleme mantığı + ince DB katmanı aynı dosyada, projenin
// kurulu desenine uygun (bkz. analytics.service.ts: saf compute + prisma
// wrapper). Bildirim (FAZ 10): tetiklenen alarm, src/lib/email-service.ts
// üzerinden (EMAIL_PROVIDER: CONSOLE/RESEND/MOCK) kullanıcının e-posta adresine
// gönderilir ve sonuç "ALERT_TRIGGERED" aksiyonuyla AuditLog'a yazılır
// (müşteri-facing olaylar için zaten AFFILIATE_CLICK / AI_DESIGN_GENERATED aynı
// yere, adminUserId:null ile yazılıyor) — metadata'da `delivered` + `provider`
// + `error` (varsa) dürüstçe raporlanır.
// ==========================================================

// ----------------------------------------------------------
// Saf tetikleme mantığı (birim testli, DB'siz)
// ----------------------------------------------------------

export interface AlertTriggerContext {
  alertType: string;
  /** PRICE_DROP için hedef fiyat; stok alarmlarında null. */
  targetPrice: number | null;
  /** Ürünün güncel stok adedi; stok takip edilmiyorsa null. */
  stockQuantity: number | null;
  /** Ürünün güncel final fiyatı (kampanya + salePrice sonrası). */
  finalPrice: number;
}

/**
 * Bir alarmın şu an tetiklenmesi gerekip gerekmediğini belirler.
 * Deterministik, hiçbir DB erişimi yok.
 *   PRICE_DROP    : targetPrice varsa ve finalPrice <= targetPrice.
 *   STOCK_RESTOCK / BACK_IN_STOCK : stok takip ediliyorsa ve quantity > 0.
 * isTriggered kontrolü bu fonksiyonda DEĞİL — zaten-tetiklenmiş alarmlar
 * çağıran taraf (checkAndTriggerAlerts) tarafından `where: { isTriggered:false }`
 * ile filtrelenir (mekanizma garantisi).
 */
export function shouldTriggerAlert(ctx: AlertTriggerContext): boolean {
  if (ctx.alertType === "PRICE_DROP") {
    return ctx.targetPrice !== null && ctx.finalPrice <= ctx.targetPrice;
  }
  if (ctx.alertType === "STOCK_RESTOCK" || ctx.alertType === "BACK_IN_STOCK") {
    return ctx.stockQuantity !== null && ctx.stockQuantity > 0;
  }
  return false;
}

// ----------------------------------------------------------
// Girdi doğrulama (route + servis ortak)
// ----------------------------------------------------------

export const alertCreateSchema = z
  .object({
    productId: z.string().min(1),
    alertType: z.enum(ALERT_TYPES),
    targetPrice: z.coerce.number().positive().max(100_000_000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // PRICE_DROP hedef fiyat ZORUNLU; stok alarmlarında hedef fiyat anlamsız.
    if (data.alertType === "PRICE_DROP" && (data.targetPrice === null || data.targetPrice === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fiyat düşüşü alarmı için hedef fiyat zorunludur.", path: ["targetPrice"] });
    }
    if (data.alertType !== "PRICE_DROP" && data.targetPrice !== null && data.targetPrice !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Hedef fiyat yalnızca PRICE_DROP alarmı için kullanılır.", path: ["targetPrice"] });
    }
  });

export type AlertCreateInput = z.infer<typeof alertCreateSchema> & { userId: string };

// ----------------------------------------------------------
// DB katmanı
// ----------------------------------------------------------

/** Kullanıcı için alarm oluşturur. Aynı (user, product, alertType) için
 *  halihazırda tetiklenmemiş bir alarm varsa yeni satır açmak yerine mevcut
 *  alarmın targetPrice'ı güncellenir (idempotent). */
export async function createAlert(input: AlertCreateInput): Promise<{ alert: ProductAlert; created: boolean }> {
  // Ürün var mı ve aktif mi? — alarm yalnızca gerçek, aktif iç ürünler için.
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.isActive) {
    throw new AlertServiceError("ALERT_PRODUCT_NOT_FOUND", "Alarm kurulacak ürün bulunamadı veya pasif.");
  }

  const targetPrice = input.alertType === "PRICE_DROP" ? input.targetPrice : null;

  const existing = await prisma.productAlert.findFirst({
    where: { userId: input.userId, productId: input.productId, alertType: input.alertType, isTriggered: false, status: "ACTIVE" },
  });

  if (existing) {
    const alert = await prisma.productAlert.update({
      where: { id: existing.id },
      data: { targetPrice },
    });
    return { alert, created: false };
  }

  const alert = await prisma.productAlert.create({
    data: {
      userId: input.userId,
      productId: input.productId,
      alertType: input.alertType,
      targetPrice,
    },
  });
  return { alert, created: true };
}

export interface TriggeredAlertResult {
  /** Tarama sırasında kontrol edilen (tetiklenmemiş) alarm sayısı. */
  checkedCount: number;
  /** Bu çalıştırmada yeni tetiklenen alarm sayısı. */
  triggeredCount: number;
  notifications: { alertId: string; productId: string; alertType: string }[];
}

/**
 * Tüm tetiklenmemiş alarmları tarar; her ürünün güncel stok + final fiyatını
 * hesaplar, shouldTriggerAlert ile değerlendirir, tetiklenenleri isTriggered=true
 * yapar ve her biri için bildirim loglar. Tek çağrıda idempotent: tetiklenen
 * alarm bir daha ele alınmaz (where: isTriggered:false).
 */
export async function checkAndTriggerAlerts(): Promise<TriggeredAlertResult> {
  const pending = await prisma.productAlert.findMany({
    where: { isTriggered: false, status: "ACTIVE" },
    select: { id: true, userId: true, productId: true, alertType: true, targetPrice: true },
  });
  if (pending.length === 0) {
    return { checkedCount: 0, triggeredCount: 0, notifications: [] };
  }

  const productIds = [...new Set(pending.map((a) => a.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { inventory: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const activeCampaigns = await getCurrentlyActiveCampaigns();

  const notifications: TriggeredAlertResult["notifications"] = [];
  for (const alert of pending) {
    const product = productById.get(alert.productId);
    // Ürün silinmiş/pasifse bu alarm için stok/fiyat durumu YOK; güvenle atla
    // (alarm tetiklenemez, kullanıcı listesinde pasif/gri görünür).
    if (!product || !product.isActive) continue;

    const finalPrice = computeFinalPrice(product, activeCampaigns).finalPrice;
    const stockQuantity = product.inventory?.quantity ?? null;

    if (!shouldTriggerAlert({
      alertType: alert.alertType,
      targetPrice: alert.targetPrice !== null ? Number(alert.targetPrice) : null,
      stockQuantity,
      finalPrice,
    })) {
      continue;
    }

    // İdempotent tetikleme: aynı anda iki worker çalışsa bile yalnızca biri
    // bu satırı günceller (isTriggered:false koşuluyla updateMany).
    const updated = await prisma.productAlert.updateMany({
      where: { id: alert.id, isTriggered: false },
      data: { isTriggered: true },
    });
    if (updated.count === 0) continue; // başka bir çalıştırma zaten tetikledi

    await notifyTriggeredAlert({ id: alert.id, userId: alert.userId, alertType: alert.alertType, targetPrice: alert.targetPrice !== null ? Number(alert.targetPrice) : null }, product, finalPrice, stockQuantity);
    notifications.push({ alertId: alert.id, productId: alert.productId, alertType: alert.alertType });
  }

  return { checkedCount: pending.length, triggeredCount: notifications.length, notifications };
}

/** Tetiklenen alarm için e-posta bildirimi gönderir. Kullanıcının e-posta
 *  adresini bulur, EMAIL_PROVIDER'a göre seçilen provider ile gönderir ve sonucu
 *  (provider, delivered, hata) AuditLog'a "ALERT_TRIGGERED" olarak yazar.
 *  Gönderim gerçek bir dağıtım kanalına ulaştıysa delivered:true; hata/eksik
 *  e-posta durumunda delivered:false + error yazılır. */
async function notifyTriggeredAlert(
  alert: { id: string; userId: string; alertType: string; targetPrice: number | null },
  product: Product,
  finalPrice: number,
  stockQuantity: number | null
): Promise<void> {
  const recipient = await prisma.user.findUnique({ where: { id: alert.userId }, select: { email: true } });
  const provider = resolveProvider();
  const draft = buildAlertEmail({
    alertType: alert.alertType,
    productName: product.name,
    finalPrice,
    targetPrice: alert.targetPrice,
    stockQuantity,
  });

  let delivered = false;
  let providerName = "none";
  let sendError: string | undefined;
  if (recipient?.email) {
    const result = await provider.send({ to: recipient.email, subject: draft.subject, text: draft.text });
    delivered = result.delivered;
    providerName = result.provider;
    sendError = result.error;
  } else {
    providerName = provider.name;
    sendError = "USER_EMAIL_MISSING";
  }

  await writeAuditLog({
    adminUserId: null,
    action: "ALERT_TRIGGERED",
    entity: "ProductAlert",
    entityId: alert.id,
    metadata: {
      userId: alert.userId,
      productId: product.id,
      productName: product.name,
      alertType: alert.alertType,
      finalPrice: Math.round(finalPrice * 100) / 100,
      stockQuantity,
      channel: "email",
      provider: providerName,
      delivered,
      ...(sendError ? { error: sendError } : {}),
    },
  });
}

export interface SerializedAlert {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productPrice: number;
  alertType: string;
  targetPrice: number | null;
  isTriggered: boolean;
  status: string;
  createdAt: Date;
}

/** Kullanıcının alarmlarını ürün adı/slug/fiyatıyla birlikte döner (UI'a hazır,
 *  Decimal → number dönüşümü yapılır). */
export async function listAlerts(userId: string): Promise<SerializedAlert[]> {
  const alerts = await prisma.productAlert.findMany({
    where: { userId },
    include: { product: { select: { name: true, slug: true, price: true } } },
    orderBy: { createdAt: "desc" },
  });
  return alerts.map((a) => ({
    id: a.id,
    productId: a.productId,
    productName: a.product.name,
    productSlug: a.product.slug,
    productPrice: Number(a.product.price),
    alertType: a.alertType,
    targetPrice: a.targetPrice !== null ? Number(a.targetPrice) : null,
    isTriggered: a.isTriggered,
    status: a.status,
    createdAt: a.createdAt,
  }));
}

/** Kullanıcının alarmını iptal eder (soft-cancel: status=CANCELLED). Kalıcı silme
 *  yerine iptal edilmiş alarm istatistikte CANCELLED olarak görünür. Ownership userId
 *  filtresiyle garanti edilir; alarm yoksa veya başkasına aitse false döner
 *  (IDOR koruması — route 404 verir). */
export async function cancelAlert(userId: string, alertId: string): Promise<boolean> {
  const alert = await prisma.productAlert.findFirst({ where: { id: alertId, userId } });
  if (!alert) return false;
  await prisma.productAlert.update({ where: { id: alert.id }, data: { status: "CANCELLED" } });
  return true;
}

export class AlertServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AlertServiceError";
    this.code = code;
  }
}
