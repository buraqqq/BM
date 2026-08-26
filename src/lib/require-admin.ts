import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import type { AdminRole } from "@/lib/enums";

/**
 * Bölüm 7/21 — tüm /api/admin/* route'larının başında çağrılır.
 * Oturum yoksa 401, oturum var ama rol yetersizse 403 döner.
 * Frontend'den gelen hiçbir veriye güvenilmez; yetki her zaman
 * sunucu tarafında, DB destekli session üzerinden kontrol edilir.
 */
export async function requireAdmin(minRole: AdminRole[] = ["STAFF", "ADMIN", "SUPER_ADMIN"]) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "UNAUTHORIZED", message: "Giriş yapmanız gerekiyor." }, { status: 401 }),
    };
  }

  if (!minRole.includes(session.user.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "FORBIDDEN", message: "Bu işlem için yetkiniz yok." }, { status: 403 }),
    };
  }

  return { ok: true as const, session };
}
