import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/require-customer";
import { alertCreateSchema, createAlert, listAlerts, AlertServiceError } from "@/lib/alerts/alert-service";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 9 — POST/GET /api/alerts
//
// Kimlik doğrulamalı (requireCustomer). Kullanıcı yalnızca KENDİ alarmlarını
// görür/oluşturur (userId = session.user.id). Girdi server-side zod ile
// doğrulanır; alertType değerleri enums.ts → ALERT_TYPES'tan tek kaynaktan gelir.
// ==========================================================

export async function GET() {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const items = await listAlerts(auth.session.user.id);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = alertCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { alert, created } = await createAlert({ ...parsed.data, userId: auth.session.user.id });
    return NextResponse.json({ alert, created }, { status: created ? 201 : 200 });
  } catch (e) {
    if (e instanceof AlertServiceError) {
      const status = e.code === "ALERT_PRODUCT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }
}
