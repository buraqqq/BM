import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getAdminAnalytics } from "@/lib/analytics-service";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 11 — GET /api/admin/analytics
//
// Admin korumalı analitik özeti: alarm istatistikleri (toplam + tip + durum
// dağılımı), en çok alarm kurulan ürünler ve e-posta bildirim teslimat
// başarı oranı. Tüm veriler canlı DB'den (ProductAlert + AuditLog) gelir;
// örnek/sabit veri YOK.
// ==========================================================
export async function GET() {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  try {
    const data = await getAdminAnalytics();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Analitik verileri alınırken bir hata oluştu." }, { status: 500 });
  }
}
