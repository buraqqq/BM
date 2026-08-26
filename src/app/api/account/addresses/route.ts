import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/require-customer";
import { addressCreateSchema } from "@/lib/customer-validation";
import { shouldForceDefault, idsToUnsetDefault } from "@/lib/address-rules";

export const dynamic = "force-dynamic";

// FAZ 4A — Bölüm 6/7: adres listeleme + oluşturma. Her zaman
// requireCustomer() ile korunur — bir kullanıcı yalnızca KENDİ adreslerini
// (userId = session.user.id ile filtrelenmiş) görebilir/oluşturabilir.
export async function GET() {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const addresses = await prisma.address.findMany({
    where: { userId: auth.session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ items: addresses });
}

export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = addressCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.address.findMany({
    where: { userId: auth.session.user.id },
    select: { id: true, isDefault: true },
  });
  const makeDefault = shouldForceDefault(existing.length, data.isDefault);

  // Bölüm 29 — TRANSACTIONS: "address default değiştirme" transaction
  // kullanmalı. Yeni adres default olacaksa, diğer tüm adreslerin
  // isDefault=false'a çekilmesi VE yeni adresin oluşturulması ATOMIK
  // olmalı — aksi halde eşzamanlı iki istek (race condition) iki adresi
  // birden default bırakabilir.
  const address = await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      const toUnset = idsToUnsetDefault(existing, "__new__"); // henüz id yok, hepsi unset edilecek
      if (toUnset.length > 0) {
        await tx.address.updateMany({ where: { id: { in: toUnset } }, data: { isDefault: false } });
      }
    }
    return tx.address.create({
      data: {
        userId: auth.session.user.id,
        title: data.title,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        city: data.city,
        district: data.district,
        neighborhood: data.neighborhood ?? null,
        addressLine: data.addressLine,
        postalCode: data.postalCode ?? null,
        country: data.country ?? "Türkiye",
        isDefault: makeDefault,
      },
    });
  });

  return NextResponse.json(address, { status: 201 });
}
