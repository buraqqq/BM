import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { resolveCart, attachGuestCookie } from "@/lib/cart-session";
import { serializeCart } from "@/lib/cart-serialize";
import { cartUpdateItemSchema } from "@/lib/customer-validation";

export const dynamic = "force-dynamic";

// FAZ 4A — Bölüm 14/20: bir CartItem yalnızca KENDİ (guest cookie veya
// authenticated user'a çözümlenen) sepetindeyse değiştirilebilir/silinebilir
// — `item.cartId !== resolved.cart.id` ise 404 (bkz. addresses/[id] ile
// AYNI IDOR savunma deseni: var/yok ile başkasına-ait ayrımı sızdırılmaz).
async function resolveOwnedItem(itemId: string, ownCartId: string) {
  const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
  if (!item || item.cartId !== ownCartId) return null;
  return item;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const customerUserId = session?.user?.kind === "customer" ? session.user.id : null;
  const resolved = await resolveCart(req, customerUserId);

  const item = await resolveOwnedItem(params.id, resolved.cart.id);
  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = cartUpdateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { quantity } = parsed.data;

  const inventory = await prisma.inventory.findUnique({ where: { productId: item.productId } });
  const stockQty = inventory?.quantity ?? null;
  if (stockQty !== null && quantity > stockQty) {
    return NextResponse.json(
      { error: "STOCK_EXCEEDED", message: `Stokta yalnızca ${stockQty} adet var.`, availableStock: stockQty },
      { status: 409 }
    );
  }

  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });

  const body2 = await serializeCart(resolved.cart.id);
  return attachGuestCookie(NextResponse.json(body2), resolved);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const customerUserId = session?.user?.kind === "customer" ? session.user.id : null;
  const resolved = await resolveCart(req, customerUserId);

  const item = await resolveOwnedItem(params.id, resolved.cart.id);
  if (!item) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.cartItem.delete({ where: { id: item.id } });

  const body = await serializeCart(resolved.cart.id);
  return attachGuestCookie(NextResponse.json(body), resolved);
}
