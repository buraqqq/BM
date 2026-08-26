import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/require-customer";
import { customerProfileUpdateSchema } from "@/lib/customer-validation";
import { normalizeEmail } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

// FAZ 4A — Bölüm 4: /hesabim profil sayfasının okuduğu/yazdığı uç.
export async function GET() {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const user = await prisma.user.findUnique({ where: { id: auth.session.user.id } });
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = customerProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Bölüm 4 — "Email değişikliği yapılacaksa mevcut auth mimarisine uygun
  // güvenli davranış belirle": yeni e-posta unique olmalı (başka bir
  // müşteride kullanılıyorsa 409). NextAuth JWT'deki `email` claim'i,
  // istemci login sonrası ayrıca useSession().update() çağırana kadar eski
  // kalır — bu, NextAuth'un standart `trigger:"update"` mekanizmasıyla
  // (bkz. src/lib/auth.ts jwt callback) çözülüyor, ayrı bir senkron sistemi
  // İCAT EDİLMEDİ.
  let email: string | undefined;
  if (data.email) {
    email = normalizeEmail(data.email);
    if (email !== auth.session.user.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash && clash.id !== auth.session.user.id) {
        return NextResponse.json({ error: "EMAIL_TAKEN", message: "Bu e-posta adresi zaten kullanımda." }, { status: 409 });
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: auth.session.user.id },
    data: {
      name: data.name,
      surname: data.surname,
      phone: data.phone,
      email,
    },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    surname: updated.surname,
    email: updated.email,
    phone: updated.phone,
    createdAt: updated.createdAt,
  });
}
