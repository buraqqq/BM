import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { customerRegisterSchema } from "@/lib/customer-validation";
import { normalizeEmail, validatePasswordStrength } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/account/register — FAZ 4A Bölüm 2.
 * Public uç (giriş gerektirmez). E-posta normalize+lowercase+unique,
 * şifre bcrypt (cost 12 — admin seed script'iyle AYNI, bkz.
 * prisma/seed-admin.ts) ile hash'lenir, düz metin HİÇBİR yerde tutulmaz.
 * Kayıt sonrası otomatik login YAPILMAZ — istemci (bkz. src/app/kayit/page.tsx)
 * kayıt başarılıysa ayrıca signIn("customer-credentials", ...) çağırır; bu,
 * "yeni ikinci authentication mekanizması" icat etmemek için mevcut NextAuth
 * akışının olduğu gibi yeniden kullanılması anlamına gelir.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = customerRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const email = normalizeEmail(data.email);

  const strength = validatePasswordStrength(data.password);
  if (!strength.ok) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: { fieldErrors: { password: [strength.reason] } } },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Bölüm 3 ile tutarlı: hesap var/yok bilgisini login'de sızdırmıyoruz,
    // ama KAYIT'ta "bu e-posta zaten kullanımda" mesajı vermek standart ve
    // gerekli bir UX'tir (login'deki "kullanıcı var/yok sızdırma" kuralı
    // farklı bir tehdit modeline aittir — orada amaç hesap keşfini
    // engellemek, burada kullanıcının kendi kaydını tamamlayabilmesi).
    return NextResponse.json({ error: "EMAIL_TAKEN", message: "Bu e-posta adresi zaten kayıtlı." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name: data.name,
      surname: data.surname,
      phone: data.phone,
      passwordHash,
    },
  });

  return NextResponse.json({ id: user.id, email: user.email, name: user.name, surname: user.surname }, { status: 201 });
}
