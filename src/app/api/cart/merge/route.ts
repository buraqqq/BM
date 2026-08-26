import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/require-customer";
import { resolveCart, clearGuestCookie, GUEST_CART_COOKIE } from "@/lib/cart-session";
import { serializeCart } from "@/lib/cart-serialize";
import { mergeCartItems } from "@/lib/cart-logic";
import { computeFinalPrice, getCurrentlyActiveCampaigns } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * POST /api/cart/merge — FAZ 4A Bölüm 19.
 * İstemci (bkz. src/app/giris/page.tsx, src/app/kayit/page.tsx), başarılı
 * signIn()'den HEMEN SONRA bu ucu çağırır: misafirken birikmiş sepet
 * (guest cookie) ile kullanıcının (varsa) mevcut sepeti birleştirilir.
 * Aynı ürün her iki sepette de varsa miktarlar TOPLANIR, stok limitini
 * AŞMAZ (bkz. src/lib/cart-logic.ts mergeCartItems — saf karar mantığı;
 * burada yalnızca DB okuma/yazma). Guest sepeti/cookie işlem sonunda
 * SİLİNİR. İş mantığı tamamen server-side (Bölüm 19 — "Business logic
 * server-side çalışmalı").
 */
export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const guestToken = req.cookies.get(GUEST_CART_COOKIE)?.value;
  const userCartResolved = await resolveCart(req, auth.session.user.id);

  if (!guestToken) {
    // Birleştirilecek misafir sepeti yok — no-op, mevcut sepeti döndür.
    return NextResponse.json(await serializeCart(userCartResolved.cart.id));
  }

  const guestCart = await prisma.cart.findUnique({ where: { sessionToken: guestToken } });
  if (!guestCart || guestCart.userId !== null || guestCart.id === userCartResolved.cart.id) {
    // Token geçersiz/zaten birine ait/zaten aynı sepet — yine de cookie'yi temizle.
    return clearGuestCookie(NextResponse.json(await serializeCart(userCartResolved.cart.id)));
  }

  const [guestItems, userItems] = await Promise.all([
    prisma.cartItem.findMany({ where: { cartId: guestCart.id } }),
    prisma.cartItem.findMany({ where: { cartId: userCartResolved.cart.id } }),
  ]);

  if (guestItems.length === 0) {
    await prisma.cart.delete({ where: { id: guestCart.id } });
    return clearGuestCookie(NextResponse.json(await serializeCart(userCartResolved.cart.id)));
  }

  const productIds = [...new Set([...guestItems, ...userItems].map((i) => i.productId))];
  const [inventories, products, activeCampaigns] = await Promise.all([
    prisma.inventory.findMany({ where: { productId: { in: productIds } } }),
    prisma.product.findMany({ where: { id: { in: productIds } }, include: { category: true } }),
    getCurrentlyActiveCampaigns(),
  ]);
  const stockByProductId: Record<string, number | null> = {};
  for (const pid of productIds) stockByProductId[pid] = inventories.find((i) => i.productId === pid)?.quantity ?? null;
  const productById = new Map(products.map((p) => [p.id, p]));

  const merged = mergeCartItems(
    guestItems.map((i) => ({ productId: i.productId, quantity: i.quantity, createdAt: i.createdAt.getTime() })),
    userItems.map((i) => ({ productId: i.productId, quantity: i.quantity, createdAt: i.createdAt.getTime() })),
    stockByProductId
  );

  // Bölüm 29 — TRANSACTIONS: "cart merge" transaction kullanmalı.
  await prisma.$transaction(async (tx) => {
    for (const line of merged) {
      const product = productById.get(line.productId);
      if (!product) continue; // ürün artık yok (hard-delete zaten kapalı ama savunma amaçlı)
      // Bölüm 15 ile tutarlı: fiyat TAHMİN edilmiyor, computeFinalPrice
      // tekrar ÇAĞRILIYOR — birleşme anı, snapshot'ı tazelemek için doğal bir nokta.
      const unitPriceAtAdd = Math.round(computeFinalPrice(product, activeCampaigns).finalPrice * 100) / 100;
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: userCartResolved.cart.id, productId: line.productId } },
        create: { cartId: userCartResolved.cart.id, productId: line.productId, quantity: line.quantity, unitPriceAtAdd },
        update: { quantity: line.quantity, unitPriceAtAdd },
      });
    }
    await tx.cart.delete({ where: { id: guestCart.id } }); // CartItem'lar CASCADE ile silinir
  });

  const body = await serializeCart(userCartResolved.cart.id);
  return clearGuestCookie(NextResponse.json(body));
}
