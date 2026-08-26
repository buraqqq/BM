import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { serializePublicProduct } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: { category: true, images: true, inventory: true },
  });

  if (!product || !product.isActive) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const activeCampaigns = await getCurrentlyActiveCampaigns();
  return NextResponse.json(serializePublicProduct(product, activeCampaigns));
}
