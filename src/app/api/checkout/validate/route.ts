import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/require-customer";
import { resolveCart } from "@/lib/cart-session";
import { serializeCart } from "@/lib/cart-serialize";
import { findOwnedAddress } from "@/lib/address-ownership";
import { checkoutValidateSchema } from "@/lib/customer-validation";
import { getPickupLocation } from "@/lib/pickup-location";
import { deriveCheckoutIssues, assembleCheckoutResponse, buildAddressSnapshot } from "@/lib/checkout-logic";

export const dynamic = "force-dynamic";

// ==========================================================
// POST /api/checkout/validate — FAZ 4B Bölüm 15.
//
// ORDER OLUŞTURMAZ. PAYMENT BAŞLATMAZ. INVENTORY DEĞİŞTİRMEZ. Yalnızca:
//   1. authenticated customer ister (Bölüm 3 — guest checkout bu fazda yok)
//   2. Cart'ı server'dan bulur (mevcut cart-session/cart-serialize — Bölüm 9)
//   3. Address ownership kontrol eder (Bölüm 4/8/17 — paylaşılan
//      findOwnedAddress, aynı 404-eşdeğeri desen)
//   4. delivery method doğrular (Bölüm 6/18 — zod enum, tek kaynak enums.ts)
//   5. ürünleri TEKRAR ÇAĞIRIR (computeFinalPrice — cart-serialize
//      üzerinden), TEKRAR YAZMAZ (Bölüm 10/11)
//   6. stokları kontrol eder (Bölüm 12/22)
//   7. yapılandırılmış sonucu döner (Bölüm 16)
//
// Bölüm 14/25/30 — CLIENT STATE SOURCE OF TRUTH DEĞİLDİR: request gövdesi
// yalnızca `addressId` ve `deliveryMethod` içerir (bkz.
// checkoutValidateSchema) — price/subtotal/total/shippingPrice/quantity gibi
// hiçbir alan okunmaz; istemci bunları gönderse bile zod tarafından
// SESSİZCE elenir, sunucu HER ZAMAN kendi hesapladığı değerleri döner.
// ==========================================================
export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = checkoutValidateSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      code: "VALIDATION_ERROR",
      message: issue.message,
      productId: undefined as string | undefined,
    }));
    return NextResponse.json({ valid: false, errors }, { status: 422 });
  }
  const { addressId, deliveryMethod } = parsed.data;

  // Bölüm 1 — checkout yalnızca sepeti olan kullanıcı için; boş sepet
  // burada da (ikinci bir savunma katmanı olarak, UI zaten /sepet'e
  // yönlendirir) reddedilir.
  const resolved = await resolveCart(req, auth.session.user.id);
  const cartBody = await serializeCart(resolved.cart.id);
  if (cartBody.items.length === 0) {
    return NextResponse.json({ valid: false, errors: [{ code: "EMPTY_CART", message: "Sepetiniz boş." }] }, { status: 422 });
  }

  // Bölüm 4/8/17 — IDOR: addressId gönderildiyse sahiplik kontrolü. "Var
  // olup olmadığını dışarı sızdırma" ilkesiyle, bulunamama VE başkasına ait
  // olma AYNI hata koduyla döner.
  let addressSnapshot = null;
  if (addressId) {
    const address = await findOwnedAddress(addressId, auth.session.user.id);
    if (!address) {
      return NextResponse.json({ valid: false, errors: [{ code: "ADDRESS_NOT_FOUND", message: "Seçilen adres bulunamadı." }] }, { status: 422 });
    }
    addressSnapshot = buildAddressSnapshot(address);
  }

  // Bölüm 11/12/21/22 — cart-serialize'in ZATEN hesapladığı güncel
  // isActive/priceChanged/stockExceeded bayrakları checkout'un hata/uyarı
  // kategorilerine ayrılır (bkz. checkout-logic.ts deriveCheckoutIssues).
  const { errors: lineErrors, warnings } = deriveCheckoutIssues(
    cartBody.items.map((line) => ({
      productId: line.productId,
      productName: line.product.name,
      isActive: line.isActive,
      priceChanged: line.priceChanged,
      oldPrice: line.unitPriceAtAdd,
      newPrice: line.currentFinalPrice,
      stockExceeded: line.stockExceeded,
      availableStock: line.stock.quantity,
    }))
  );

  if (lineErrors.length > 0) {
    return NextResponse.json(
      assembleCheckoutResponse({
        cartId: cartBody.cartId,
        items: cartBody.items,
        cartTotals: cartBody.totals,
        method: deliveryMethod,
        addressSnapshot,
        pickupLocation: null,
        errors: lineErrors,
        warnings,
        subtotal: cartBody.totals.subtotal,
      }),
      { status: 422 }
    );
  }

  // Bölüm 7/29 — yalnızca Gel-Al seçildiyse teslim alma noktası bilgisi
  // (gerçek Setting verisi, bkz. pickup-location.ts) getirilir.
  const pickupLocation = deliveryMethod === "PICKUP" ? await getPickupLocation() : null;

  const result = assembleCheckoutResponse({
    cartId: cartBody.cartId,
    items: cartBody.items,
    cartTotals: cartBody.totals,
    method: deliveryMethod,
    addressSnapshot,
    pickupLocation,
    errors: [],
    warnings,
    subtotal: cartBody.totals.subtotal,
  });

  return NextResponse.json(result, { status: 200 });
}
