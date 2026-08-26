import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { resolveCart, attachGuestCookie } from "@/lib/cart-session";
import { serializeCart } from "@/lib/cart-serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/cart — FAZ 4A Bölüm 9/10/18. Hem misafir hem kimliği doğrulanmış
 * müşteri için çalışır (Bölüm 18 — "localStorage'ı tek başına source of
 * truth olarak kullanma", gerçek kaynak burada, DB'deki Cart/CartItem).
 * Oturum varsa (`kind==="customer"`) DB'de o kullanıcıya ait sepet
 * bulunur/oluşturulur; yoksa `bm_guest_cart` HttpOnly cookie'siyle.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const customerUserId = session?.user?.kind === "customer" ? session.user.id : null;

  const resolved = await resolveCart(req, customerUserId);
  const body = await serializeCart(resolved.cart.id);

  return attachGuestCookie(NextResponse.json(body), resolved);
}

/** DELETE /api/cart — Bölüm 10: sepeti tamamen boşalt. */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const customerUserId = session?.user?.kind === "customer" ? session.user.id : null;

  const resolved = await resolveCart(req, customerUserId);
  await prisma.cartItem.deleteMany({ where: { cartId: resolved.cart.id } });
  const body = await serializeCart(resolved.cart.id);

  return attachGuestCookie(NextResponse.json(body), resolved);
}
