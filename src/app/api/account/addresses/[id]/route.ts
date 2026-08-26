import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/require-customer";
import { addressUpdateSchema } from "@/lib/customer-validation";
import { idsToUnsetDefault, pickPromotedDefaultId } from "@/lib/address-rules";

export const dynamic = "force-dynamic";

// ==========================================================
// FAZ 4A — Bölüm 8: "Kullanıcı sadece KENDİ adreslerine erişebilmeli...
// IDOR / authorization testleri ekle."
//
// Savunma deseni: adres önce id'ye göre bulunur, SONRA `userId ===
// session.user.id` kontrol edilir; eşleşmezse — adres hiç yoksa da,
// BAŞKASINA aitse de — AYNI 404 NOT_FOUND döner (403 değil). Bu bilinçli
// bir seçim: "bu id var ama sana ait değil" ile "bu id hiç yok" arasındaki
// farkı dışarı sızdırmamak, ID enumeration/IDOR saldırılarını bir adım daha
// zorlaştırır (bkz. docs/security.md).
// ==========================================================
async function findOwnedAddress(id: string, userId: string) {
  const address = await prisma.address.findUnique({ where: { id } });
  if (!address || address.userId !== userId) return null;
  return address;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const address = await findOwnedAddress(params.id, auth.session.user.id);
  if (!address) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json(address);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const address = await findOwnedAddress(params.id, auth.session.user.id);
  if (!address) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = addressUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const wantsDefault = data.isDefault === true;

  const updated = await prisma.$transaction(async (tx) => {
    if (wantsDefault) {
      const siblings = await tx.address.findMany({
        where: { userId: auth.session.user.id },
        select: { id: true, isDefault: true },
      });
      const toUnset = idsToUnsetDefault(siblings, address.id);
      if (toUnset.length > 0) {
        await tx.address.updateMany({ where: { id: { in: toUnset } }, data: { isDefault: false } });
      }
    }
    return tx.address.update({
      where: { id: address.id },
      data: {
        title: data.title,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        city: data.city,
        district: data.district,
        neighborhood: data.neighborhood,
        addressLine: data.addressLine,
        postalCode: data.postalCode,
        country: data.country,
        isDefault: data.isDefault, // undefined ise Prisma alanı değiştirmez
      },
    });
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const address = await findOwnedAddress(params.id, auth.session.user.id);
  if (!address) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Bölüm 7 — silinen adres default'sa ve başka adres kaldıysa, kalanlardan
  // en yenisi otomatik default olur (bkz. address-rules.ts). Transaction
  // içinde: sil + (gerekiyorsa) promote.
  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: address.id } });
    if (address.isDefault) {
      const remaining = await tx.address.findMany({
        where: { userId: auth.session.user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const promoteId = pickPromotedDefaultId(remaining);
      if (promoteId) {
        await tx.address.update({ where: { id: promoteId }, data: { isDefault: true } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
