import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { resolveCart, attachGuestCookie } from "@/lib/cart-session";
import { serializeCart } from "@/lib/cart-serialize";
import { cartAddItemSchema } from "@/lib/customer-validation";
import { computeFinalPrice, getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { exceedsStock } from "@/lib/cart-logic";

export const dynamic = "force-dynamic";

/**
 * POST /api/cart/items — FAZ 4A Bölüm 12/13/15.
 * - isActive=false ürün eklenemez (Bölüm 12).
 * - Stok takip ediliyorsa (Inventory var), (mevcut sepet miktarı + eklenecek
 *   miktar) stoğu aşarsa 409 ile REDDEDİLİR (Bölüm 13 — "reddet", sessizce
 *   kısma değil). SEPETE EKLEME STOK REZERVASYONU DEĞİLDİR: Inventory.quantity
 *   hiçbir şekilde değiştirilmez, InventoryMovement OLUŞTURULMAZ.
 * - Fiyat snapshot'ı computeFinalPrice() ile (Bölüm 15) — pricing engine
 *   İKİNCİ KEZ YAZILMADI, doğrudan çağrıldı (aynı fonksiyon storefront
 *   listelemede ve price-sort'ta kullanılan).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const customerUserId = session?.user?.kind === "customer" ? session.user.id : null;

  const body = await req.json().catch(() => null);
  const parsed = cartAddItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { productId, quantity: requestedQty } = parsed.data;
  const quantity = requestedQty ?? 1;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true, inventory: true },
  });
  if (!product || !product.isActive) {
    return NextResponse.json({ error: "PRODUCT_NOT_AVAILABLE", message: "Bu ürün şu anda satışta değil." }, { status: 404 });
  }

  const resolved = await resolveCart(req, customerUserId);

  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: resolved.cart.id, productId } },
  });
  const currentQtyInCart = existingItem?.quantity ?? 0;
  const stockQty = product.inventory?.quantity ?? null;

  if (exceedsStock(currentQtyInCart, quantity, stockQty)) {
    return NextResponse.json(
      {
        error: "STOCK_EXCEEDED",
        message: `Stokta yalnızca ${stockQty} adet var.`,
        availableStock: stockQty,
        currentQuantityInCart: currentQtyInCart,
      },
      { status: 409 }
    );
  }

  const activeCampaigns = await getCurrentlyActiveCampaigns();
  const breakdown = computeFinalPrice(product, activeCampaigns);
  const unitPriceAtAdd = Math.round(breakdown.finalPrice * 100) / 100;

  if (existingItem) {
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: currentQtyInCart + quantity, unitPriceAtAdd },
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId: resolved.cart.id, productId, quantity, unitPriceAtAdd },
    });
  }

  const responseBody = await serializeCart(resolved.cart.id);
  return attachGuestCookie(NextResponse.json(responseBody, { status: 201 }), resolved);
}
