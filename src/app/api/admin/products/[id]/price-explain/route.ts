import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getCurrentlyActiveCampaigns, explainPriceDecision } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// Bölüm 17 — Kampanya çakışma açıklaması: bu ürün için şu an geçerli olan
// TÜM kampanyaları, ürettikleri fiyatı ve hangisinin kazandığını (neden)
// döner. Admin panelinde ürün detay / fiyatlandırma ekranında gösterilir.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: { id: true, categoryId: true, price: true, compareAtPrice: true, salePrice: true },
  });
  if (!product) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const activeCampaigns = await getCurrentlyActiveCampaigns();
  const explanation = explainPriceDecision(product, activeCampaigns);

  return NextResponse.json(explanation);
}
