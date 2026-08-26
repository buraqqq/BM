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

export function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
