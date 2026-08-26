// ==========================================================
// FAZ 4A — Bölüm 2/3: müşteri kayıt/giriş için DB'siz, saf (pure) yardımcı
// fonksiyonlar. Bilerek Prisma'ya dokunmuyorlar — src/lib/auth.ts (customer
// login) ve src/app/api/account/register/route.ts (kayıt) bunları
// kullanıyor; birim testler (src/lib/__tests__/customer-auth.test.ts) DB'siz
// çalışıyor (mevcut price-sort.ts / pricing.ts ile aynı desen: iş mantığı
// saf fonksiyonlarda, DB erişimi ayrı, ince bir katmanda).
// ==========================================================

/** E-posta normalize kuralı: trim + lowercase. Hem kayıt hem login'de AYNI kural kullanılır ki "Ali@X.com" ile "ali@x.com" iki farklı hesap olarak açılamasın. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Bölüm 2 — "minimum güvenlik şartı". Aşırı karmaşık bir politika (özel
 * karakter zorunluluğu vb.) BİLEREK eklenmedi — küçük bir esnaf/bahçe
 * mağazası müşteri kitlesi için makul bir denge: en az 8 karakter, en az bir
 * harf VE en az bir rakam. Daha sıkı bir politika istenirse burası tek
 * değişiklik noktası.
 */
export function validatePasswordStrength(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.` };
  }
  if (!/[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(password)) {
    return { ok: false, reason: "Şifre en az bir harf içermeli." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, reason: "Şifre en az bir rakam içermeli." };
  }
  return { ok: true };
}

/** Bölüm 4 — profil ekranında gösterilecek tam ad. */
export function fullName(name: string | null | undefined, surname: string | null | undefined): string {
  return [name, surname].filter(Boolean).join(" ").trim();
}
