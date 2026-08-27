import { NextRequest, NextResponse } from "next/server";
import { checkAndTriggerAlerts } from "@/lib/alerts/alert-service";
import { verifyCronSecret } from "@/lib/cron-auth";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 13 — GET /api/cron/alerts
//
// Harici cron servisleri (GitHub Actions, Vercel Cron, Netlify Scheduled
// Functions, uptime-ping) için servis-token korumalı alarm tarama ucu.
// `POST /api/admin/alerts/trigger` admin oturumu gerektirir; cron servisleri ise
// bu uca `Authorization: Bearer <CRON_SECRET>` başlığıyla istek atar.
//
// GÜVENLİK:
// - CRON_SECRET env'i ayarlanmadıysa uç 503 döner (fail-closed) — açıkta uç
//   bırakılmaz. Doğrulama crypto.timingSafeEqual ile yapılır (bkz. cron-auth.ts).
// - Tarama özeti "ALERT_SCAN" aksiyonuyla loglanır; e-posta teslimatı ise
//   notifyTriggeredAlert içindeki "ALERT_TRIGGERED" loglarından ayrı tutulur —
//   bu sayede admin analitik "e-posta başarı oranı" tarama özetleriyle kirlenmez.
// ==========================================================
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

  if (!verifyCronSecret(provided, expected)) {
    return NextResponse.json(
      { error: expected ? "UNAUTHORIZED" : "CRON_SECRET_NOT_CONFIGURED" },
      { status: expected ? 401 : 503 }
    );
  }

  try {
    const result = await checkAndTriggerAlerts();

    await writeAuditLog({
      adminUserId: null,
      action: "ALERT_SCAN",
      entity: "ProductAlert",
      metadata: {
        triggerMode: "cron",
        checkedCount: result.checkedCount,
        triggeredCount: result.triggeredCount,
      },
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Alarm taraması sırasında bir hata oluştu." }, { status: 500 });
  }
}
