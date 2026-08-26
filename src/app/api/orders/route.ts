import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/require-customer";
import { resolveCart } from "@/lib/cart-session";
import { findOwnedAddress } from "@/lib/address-ownership";
import { checkoutValidateSchema } from "@/lib/customer-validation";
import { buildAddressSnapshot } from "@/lib/checkout-logic";
import { calculateShippingPrice, computeCheckoutTotals } from "@/lib/checkout-logic";
import { computeFinalPrice, getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { deriveStockStatus } from "@/lib/stock-status";
import { generateOrderNumber, buildOrderLine, sumOrderSubtotal } from "@/lib/order-logic";
import { serializeOrder, serializeOrderSummary } from "@/lib/order-serialize";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 4C — POST /api/orders (gerçek sipariş oluşturma)
//
// FAZ 4B'deki /api/checkout/validate SADECE doğruluyordu (DB'ye yazmıyordu).
// Bu uç, o doğrulama akışını GERÇEK Order oluşturmaya taşır. Kesin sınır:
//   - GERÇEK ÖDEME YOK (paymentStatus "PENDING" başlar, iyzico/PayTR/Stripe yok).
//   - Client'tan gelen hiçbir parasal değer (price/subtotal/total/quantity)
//     source of truth DEĞİLDİR — gövde yalnızca `addressId` + `deliveryMethod`
//     içerir (checkoutValidateSchema, FAZ 4B'den AYNEN yeniden kullanılır).
//
// Akış (Bölüm F): requireCustomer → cart bul → boşsa reddet → delivery/adres
// doğrula → ürünleri TEKRAR oku → aktif/stok/fiyat YENİDEN doğrula (pricing
// engine YENİDEN ÇAĞRILIR, tekrar yazılmaz) → server-side subtotal/shipping/
// total → transaction içinde: sepeti atomik "claim" et, stoğu atomik düş,
// InventoryMovement(SALE) yaz, Order+OrderItem+AddressSnapshot+StatusHistory
// oluştur → response.
// ==========================================================

// Bilinçli, yapılandırılmış bir hata tipi — transaction içinden fırlatılır,
// dışarıda tek bir yerde HTTP cevabına çevrilir.
class OrderCreationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

async function mapCreateErrors(err: unknown): Promise<NextResponse | null> {
  if (err instanceof OrderCreationError) {
    return NextResponse.json({ error: err.code, message: err.message, ...(err.extra ?? {}) }, { status: err.status });
  }
  // orderNumber benzersizlik çakışması (astronomik derecede nadir) — çağırana retry sinyali
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return NextResponse.json({ error: "ORDER_NUMBER_RETRY", message: "Sipariş numarası çakıştı, lütfen tekrar deneyin." }, { status: 409 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;
  const userId = auth.session.user.id;

  // Bölüm F adım 14 — istemciden yalnızca addressId + deliveryMethod okunur.
  const body = await req.json().catch(() => null);
  const parsed = checkoutValidateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 });
  }
  const { addressId, deliveryMethod } = parsed.data;

  // Bölüm F adım 2 — server'dan aktif sepet.
  const resolved = await resolveCart(req, userId);
  const cartId = resolved.cart.id;

  // Bölüm F adım 6 — cart'taki tüm ürünler ürün+stok ilişkileriyle yeniden okunur.
  const cartItems = await prisma.cartItem.findMany({
    where: { cartId },
    include: { product: { include: { inventory: true, category: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Bölüm F adım 3 — boş sepet reddedilir.
  if (cartItems.length === 0) {
    return NextResponse.json({ error: "EMPTY_CART", message: "Sepetiniz boş." }, { status: 422 });
  }

  // Bölüm F adım 4/5 — teslimat yöntemi zod ile zaten doğrulandı; DELIVERY için
  // adres sahipliği kontrolü (FAZ 4B ile AYNI 404-eşdeğeri IDOR deseni).
  let addressSnapshot = null;
  if (deliveryMethod === "DELIVERY") {
    const address = await findOwnedAddress(addressId!, userId);
    if (!address) {
      return NextResponse.json({ error: "ADDRESS_NOT_FOUND", message: "Seçilen adres bulunamadı." }, { status: 422 });
    }
    addressSnapshot = buildAddressSnapshot(address);
  }

  // Bölüm F adım 7/8/9 — ürünleri aktiflik/stok/fiyat açısından YENİDEN doğrula.
  // Fiyat, pricing engine'den (computeFinalPrice) TEKRAR ÇAĞRILARAK alınır.
  const activeCampaigns = await getCurrentlyActiveCampaigns();

  interface PreparedLine {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    finalPrice: number;
    inventoryId: string | null;
    lowStockThreshold: number | null;
  }

  const prepared: PreparedLine[] = [];
  for (const item of cartItems) {
    const p = item.product;

    if (!p.isActive) {
      return NextResponse.json(
        { error: "INACTIVE_PRODUCT", message: `"${p.name}" artık satışta değil.`, productId: p.id },
        { status: 422 }
      );
    }

    const stockQty = p.inventory?.quantity ?? null;
    if (stockQty !== null && item.quantity > stockQty) {
      return NextResponse.json(
        {
          error: "STOCK_INSUFFICIENT",
          message: `"${p.name}" için yeterli stok bulunmuyor (mevcut: ${stockQty} adet).`,
          productId: p.id,
          availableStock: stockQty,
        },
        { status: 422 }
      );
    }

    const breakdown = computeFinalPrice(p, activeCampaigns);
    const finalPrice = Math.round(breakdown.finalPrice * 100) / 100;

    prepared.push({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      quantity: item.quantity,
      finalPrice,
      inventoryId: p.inventory?.id ?? null,
      lowStockThreshold: p.inventory?.lowStockThreshold ?? null,
    });
  }

  // Bölüm F adım 9/10/11/12/13 — server-side satır snapshot + ara toplam +
  // kargo + toplam (hepsi mevcut saf fonksiyonlarla, ikinci kez yazılmadan).
  const orderLines = prepared.map((l) =>
    buildOrderLine({ productId: l.productId, productName: l.productName, sku: l.sku, quantity: l.quantity, finalPrice: l.finalPrice })
  );
  const subtotal = sumOrderSubtotal(orderLines);
  const shipping = calculateShippingPrice(deliveryMethod);
  const totals = computeCheckoutTotals(subtotal, shipping);

  // Bölüm F adım 15-21 — tek transaction: claim + stok + order + snapshotlar.
  // orderNumber çakışması için en fazla 3 deneme (32^8 uzayda pratikte 1 deneme yeter).
  let createdOrder: Awaited<ReturnType<typeof prisma.order.findUnique>> | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const orderNumber = generateOrderNumber();
    try {
      const order = await prisma.$transaction(async (tx) => {
        // (a) Bölüm H — sepeti ATOMIK "claim" et (ACTIVE → CONVERTED). Bu,
        // çift-submit/duplicate order korumasının mekanik garantisidir: yalnızca
        // BİR istek bu updateMany'de count=1 alabilir; diğeri count=0 alır.
        const claim = await tx.cart.updateMany({
          where: { id: cartId, status: "ACTIVE" },
          data: { status: "CONVERTED" },
        });
        if (claim.count === 0) {
          const existing = await tx.order.findUnique({ where: { cartId } });
          throw new OrderCreationError(
            "ORDER_ALREADY_CREATED",
            "Bu sepet için sipariş zaten oluşturuldu.",
            409,
            { orderNumber: existing?.orderNumber ?? null }
          );
        }

        // (b) Bölüm G — stoğu ATOMIK düş. `quantity >= X` guard'ı ile negatif
        // stoğa düşmek SQL düzeyinde imkânsızdır (SQLite tek-yazıcı modeli +
        // koşullu UPDATE — concurrency notu docs/security.md'de).
        for (const line of prepared) {
          if (line.inventoryId === null) continue; // stok takip edilmiyor (sınırsız)

          const dec = await tx.inventory.updateMany({
            where: { id: line.inventoryId, quantity: { gte: line.quantity } },
            data: { quantity: { decrement: line.quantity } },
          });
          if (dec.count === 0) {
            throw new OrderCreationError(
              "STOCK_INSUFFICIENT",
              `"${line.productName}" için yeterli stok bulunmuyor.`,
              422,
              { productId: line.productId }
            );
          }

          const inv = await tx.inventory.findUniqueOrThrow({ where: { id: line.inventoryId } });
          const newStatus = deriveStockStatus(inv.quantity, line.lowStockThreshold ?? 5);
          await tx.inventory.update({ where: { id: inv.id }, data: { stockStatus: newStatus } });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              type: "SALE",
              quantityChange: -line.quantity,
              resultingQuantity: inv.quantity,
              reason: `Sipariş ${orderNumber}`,
              createdByAdminId: null,
            },
          });
        }

        // (c) Bölüm B/C/N — Order + OrderItem snapshotları + adres snapshotı
        // + ilk durum geçmişi (PENDING) tek transaction içinde.
        const order = await tx.order.create({
          data: {
            orderNumber,
            cartId,
            userId,
            status: "PENDING",
            paymentStatus: "PENDING",
            deliveryMethod,
            currency: "TRY",
            subtotal,
            discount: totals.discount,
            shippingAmount: shipping.amount,
            shippingComputed: shipping.computed,
            shippingNote: shipping.note,
            total: totals.total,
            items: {
              create: orderLines.map((l) => ({
                productId: l.productId,
                productName: l.productName,
                sku: l.sku,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                lineTotal: l.lineTotal,
              })),
            },
            statusHistory: { create: { fromStatus: null, toStatus: "PENDING" } },
          },
        });

        if (addressSnapshot) {
          await tx.orderAddressSnapshot.create({ data: { orderId: order.id, ...addressSnapshot } });
        }

        return order;
      });

      createdOrder = order;
      break;
    } catch (err) {
      const mapped = await mapCreateErrors(err);
      if (mapped) return mapped;
      if (attempt === 2) throw err;
      // orderNumber çakışması (P2002) — yeni numarayla dene
    }
  }

  // Güvenlik kemeri: normalde yukarıdaki döngü ya döner ya da fırlatır.
  if (!createdOrder) {
    return NextResponse.json({ error: "ORDER_CREATE_FAILED", message: "Sipariş oluşturulamadı." }, { status: 500 });
  }

  const full = await prisma.order.findUnique({
    where: { id: createdOrder.id },
    include: { items: true, addressSnapshot: true, statusHistory: true },
  });

  return NextResponse.json(serializeOrder(full!), { status: 201 });
}

// ==========================================================
// FAZ 4C — GET /api/orders (müşterinin KENDİ siparişleri)
// Bölüm J: yalnızca userId = session.user.id filtresiyle — başka kullanıcının
// siparişi listeye asla girmez. Pagination mevcut desenle (page/pageSize).
// ==========================================================
export async function GET(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;
  const userId = auth.session.user.id;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 10)));

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return NextResponse.json({
    items: items.map(serializeOrderSummary),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}
