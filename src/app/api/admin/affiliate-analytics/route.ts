import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getAffiliateAnalytics } from "@/lib/services/analytics.service";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 7 — GET /api/admin/affiliate-analytics?days=30
// Admin korumalı affiliate performans özeti (toplam tıklama, en çok satıcı,
// günlük tıklama, gerçek BOM match başarı oranı).
//
// Uyarlama notu: taslak `@/lib/auth/guards` kullanıyordu — bu projede guard
// `@/lib/require-admin`'dir (imza farklı: { ok, response } döner). `days`
// parametresi NaN/negatif/dev değerlere karşı 1..365 aralığına kilitlenir.
// ==========================================================
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = Number.parseInt(searchParams.get("days") ?? "30", 10);
    const days = Number.isFinite(parsed) ? Math.min(365, Math.max(1, parsed)) : 30;

    const data = await getAffiliateAnalytics(days);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Analytics verileri alınırken bir hata oluştu." }, { status: 500 });
  }
}
