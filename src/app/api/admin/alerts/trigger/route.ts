import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkAndTriggerAlerts } from "@/lib/alerts/alert-service";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 9 — POST /api/admin/alerts/trigger
//
// Manuel cron tetikleme altyapısı: bekleyen tüm stok/fiyat alarmlarını tarar,
// tetiklenmesi gerekenleri tetikler ve kaç alarmın kontrol edildiğini /
// tetiklendiğini raporlar. Admin korumalı (requireAdmin). Gerçek bir cron
// servisi yok (bkz. pricing.ts'teki "aktiflik okuma anında türetilir" kararı) —
// bu endpoint, istenirse harici bir cron/uptime servisinden çağrılabilir.
// ==========================================================
export async function POST(req: Request) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  try {
    const result = await checkAndTriggerAlerts();

    await writeAuditLog({
      adminUserId: auth.session.user.id,
      action: "ALERT_SCAN",
      entity: "ProductAlert",
      metadata: {
        triggerMode: "manual_cron",
        checkedCount: result.checkedCount,
        triggeredCount: result.triggeredCount,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Alarm taraması sırasında bir hata oluştu." }, { status: 500 });
  }
}
