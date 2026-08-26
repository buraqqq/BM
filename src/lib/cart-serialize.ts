import { prisma } from "@/lib/prisma";
import { computeFinalPrice, getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { computeCartTotals, detectPriceChange, clampQuantity } from "@/lib/cart-logic";

// ==========================================================
// FAZ 4A — Bölüm 16/17/21/22: sepet GÖRÜNTÜLENDİĞİNDE (GET /api/cart ve her
// mutation'ın döndürdüğü güncel sepet gövdesi) her satır için:
//   - GÜNCEL final fiyat (computeFinalPrice — pricing engine YENİDEN
//     ÇAĞRILIYOR, ikinci kez YAZILMIYOR)
//   - fiyat değişti mi (unitPriceAtAdd snapshot'a göre)
//   - ürün hâlâ satışta mı (isActive)
//   - güncel stok ve "sepetteki miktar stoğu aşıyor mu"
// hesaplanır. Bu fonksiyon HİÇBİR alanı sessizce güncellemez/DB'ye yazmaz —
// yalnızca OKUR ve karşılaştırır; kullanıcı değişikliği görüp bir aksiyon
// (miktar güncelle/sil) aldığında gerçek yazma o ayrı route'ta olur.
// ==========================================================

export async function serializeCart(cartId: string) {
  const [items, activeCampaigns] = await Promise.all([
    prisma.cartItem.findMany({
      where: { cartId },
      include: {
        product: {
          include: { category: true, images: { where: { isPrimary: true }, take: 1 }, inventory: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    getCurrentlyActiveCampaigns(),
  ]);

  const lines = items.map((item) => {
    const p = item.product;
    const breakdown = computeFinalPrice(p, activeCampaigns);
    const currentFinalPrice = Math.round(breakdown.finalPrice * 100) / 100;
    const priceChange = detectPriceChange(Number(item.unitPriceAtAdd), currentFinalPrice);
    const stockQty = p.inventory?.quantity ?? null;
    const stockStatus = p.inventory?.stockStatus ?? "IN_STOCK";
    const stockExceeded = stockQty !== null && item.quantity > stockQty;
    const maxAllowedQuantity = clampQuantity(item.quantity, stockQty);

    return {
      id: item.id,
      productId: p.id,
      product: {
        id: p.id,
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        image: p.images[0] ? { url: p.images[0].url, alt: p.images[0].altText } : null,
      },
      quantity: item.quantity,
      unitPriceAtAdd: Number(item.unitPriceAtAdd),
      currentFinalPrice,
      priceChanged: priceChange.changed,
      lineTotal: Math.round(item.quantity * currentFinalPrice * 100) / 100,
      isActive: p.isActive,
      stock: { status: stockStatus, quantity: stockQty },
      stockExceeded,
      maxAllowedQuantity,
      createdAt: item.createdAt,
    };
  });

  // Bölüm 17 — toplam yalnızca hâlâ SATIŞTA olan satırlardan hesaplanır;
  // satıştan kalkmış bir ürünün fiyatı sepet toplamını yanıltmasın (kullanıcı
  // yine de satırı görür, "Bu ürün artık satışta değil" uyarısıyla — bkz.
  // Bölüm 21/23) ama checkout'a hiç gidilmediği için bu, şimdilik yalnızca
  // görüntü amaçlı bir toplam.
  const totals = computeCartTotals(lines.filter((l) => l.isActive).map((l) => ({ quantity: l.quantity, currentFinalPrice: l.currentFinalPrice })));

  return { cartId, items: lines, totals };
}
