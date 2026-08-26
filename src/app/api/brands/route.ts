import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBrand } from "@/lib/serialize";

export const dynamic = "force-dynamic";

// FAZ 3 — Bölüm 3/5: herkese açık marka listesi. Ürün listeleme/kategori/
// arama sayfalarındaki "Marka" filtresi bunu kullanır. Yalnızca isActive=true
// VE en az bir aktif ürünü olan markalar döner (0 ürünlü bir markayı filtre
// seçeneği olarak göstermek kullanıcıyı boş sonuca götürür).
export async function GET() {
  const brands = await prisma.brand.findMany({
    where: { isActive: true, products: { some: { isActive: true } } },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });
  return NextResponse.json({ items: brands.map(serializeBrand) });
}
