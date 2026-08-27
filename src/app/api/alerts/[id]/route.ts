import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/require-customer";
import { deleteAlert } from "@/lib/alerts/alert-service";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 9 — DELETE /api/alerts/[id]
//
// Alarm iptali. Ownership userId filtresiyle servis katmanında garanti edilir
// (deleteAlert): alarm hiç yoksa da, BAŞKASINA aitse de AYNI 404 NOT_FOUND
// döner — ID enumeration/IDOR'u zorlaştırır (bkz. account/addresses/[id] aynı
// desen, docs/security.md).
// ==========================================================

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const ok = await deleteAlert(auth.session.user.id, params.id);
  if (!ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
