import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/require-customer";
import { customerPasswordChangeSchema } from "@/lib/customer-validation";
import { validatePasswordStrength } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/account/password — FAZ 4A Bölüm 5.
 * current password bcrypt.compare ile doğrulanır, yeni şifre bcrypt (cost 12)
 * ile yeniden hash'lenir. "Session güvenliği korunmalı" — bu fazda ayrı bir
 * session-invalidation/refresh-token mimarisi İCAT EDİLMEDİ (mevcut JWT
 * stratejisi tek session store'suz mimari, bkz. auth.ts) — şifre değişikliği
 * sonrası MEVCUT oturum doğal süresi (8 saat) içinde geçerli kalmaya devam
 * eder; bu bilinen, dokümante edilmiş bir sınırdır (bkz. FAZ4A raporu
 * "Known limitations" ve docs/security.md).
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = customerPasswordChangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: auth.session.user.id } });
  if (!user?.passwordHash) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentOk) {
    return NextResponse.json({ error: "INVALID_PASSWORD", message: "Mevcut şifre hatalı." }, { status: 400 });
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: { fieldErrors: { newPassword: [strength.reason] } } },
      { status: 400 }
    );
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

  return NextResponse.json({ ok: true });
}
