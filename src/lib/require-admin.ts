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

  // FAZ 4A — Bölüm 1: NextAuth artık iki tür oturum taşıyor (admin/customer,
  // bkz. src/lib/auth.ts). Bir müşteri oturumuyla admin uca erişim denemesi
  // burada AÇIKÇA reddedilir — `session.user.role` customer için zaten
  // undefined olduğundan aşağıdaki `minRole.includes` kontrolü tek başına da
  // güvenli (fail-closed) davranırdı, ama kind kontrolü niyeti daha net
  // ifade eder ve gelecekte role listesine yanlışlıkla "undefined" eklenmesi
  // gibi bir hataya karşı ekstra savunma sağlar.
  if (session.user.kind !== "admin" || !session.user.role || !minRole.includes(session.user.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "FORBIDDEN", message: "Bu işlem için yetkiniz yok." }, { status: 403 }),
    };
  }

  return { ok: true as const, session };
}
