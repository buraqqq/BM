import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { serializePublicProduct } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: {
      category: true,
      brand: true,
      images: true,
      inventory: true,
      // FAZ 3 — Bölüm 4: ürün detay sayfasındaki "Teknik Özellikler" tablosu
      // için. Şu an gerçek veride hiçbir ürünün attributeValues'u yok (bkz.
      // FAZ2.1 db-integrity-check çıktısı) — boş dizi olarak dönecek, sayfa
      // bunu koşullu olarak (0 satırsa tabloyu hiç göstermeden) ele alıyor.
      attributeValues: { include: { attributeDefinition: true } },
    },
  });

  if (!product || !product.isActive) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const activeCampaigns = await getCurrentlyActiveCampaigns();
  return NextResponse.json(serializePublicProduct(product, activeCampaigns));
}
