import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

/**
 * FAZ 4A — Bölüm 1/8: src/lib/require-admin.ts ile AYNI desen, müşteri
 * (customer) oturumları için. Tüm /api/account/* ve kimliği doğrulanmış
 * /api/cart/* işlemlerinin başında çağrılır. Bir admin oturumuyla bu uçlara
 * erişim de burada reddedilir (kind !== "customer") — iki oturum türü asla
 * birbirinin ucuna erişemez.
 */
export async function requireCustomer() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.kind !== "customer") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "UNAUTHORIZED", message: "Giriş yapmanız gerekiyor." }, { status: 401 }),
    };
  }

  return { ok: true as const, session };
}
