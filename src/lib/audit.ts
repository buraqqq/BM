import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@/lib/enums";

interface WriteAuditLogInput {
  adminUserId: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Bölüm 14 — Audit Log gereksinimi.
 * Kritik admin işlemlerinin tamamı bu fonksiyon üzerinden loglanır.
 * Hata durumunda ana işlemi bloklamaz (best-effort) ama konsola yazar,
 * çünkü audit logun kendisinin başarısız olması ürün/fiyat işlemini
 * durdurmamalı; yine de sessizce yutulmaz.
 */
export async function writeAuditLog(input: WriteAuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        ipAddress: input.ipAddress ?? null,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  } catch (err) {
    console.error("[audit-log] yazılamadı:", err);
  }
}

/**
 * Güncelleme (adversarial inceleme, 2026-09):
 * X-Forwarded-For tamamen istemci tarafından taklit edilebilir (spoofable) —
 * bir saldırgan her istekte farklı bir sahte "X-Forwarded-For: 1.2.3.4" header'ı
 * göndererek hem rate-limit'i (src/lib/rate-limit.ts, IP+e-posta bazlı) hem de
 * audit log'daki IP kaydını anlamsız hale getirebiliyordu.
 * Öncelik sırası:
 *   1) Platformun KENDİ eklediği, istemcinin ÜZERİNE YAZAMAYACAĞI header
 *      (Vercel: x-vercel-forwarded-for, Netlify: x-nf-client-connection-ip —
 *      bu platformlar gelen istekteki aynı isimli header'ı proxy'ye girerken
 *      siler ve kendi gerçek değerleriyle değiştirir).
 *   2) x-real-ip — çoğu reverse-proxy/CDN kurulumunda (nginx, Cloudflare vb.)
 *      proxy tarafından set edilir.
 *   3) x-forwarded-for zincirinin SON (en sona eklenen) hop'u — zincirin İLK
 *      hop'u istemcinin kendisi tarafından yazılabildiği için güvenilmez;
 *      en güvenilir olan, zincire en son ekleme yapan (uygulamaya en yakın)
 *      proxy'nin eklediği değerdir.
 * ÖNEMLİ: Bu yalnızca uygulama güvenilir bir reverse-proxy/CDN arkasında
 * çalıştırıldığında güvenlidir (bkz. DEPLOYMENT.md güvenlik kontrol listesi).
 * Uygulama doğrudan internete açık çalıştırılırsa (proxy'siz) hiçbir header
 * güvenilir değildir — bu durumda gerçek çözüm platform/altyapı seviyesindedir.
 */
export function getClientIp(req: Request): string | null {
  const vercelIp = req.headers.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0].trim();

  const netlifyIp = req.headers.get("x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return null;
}
