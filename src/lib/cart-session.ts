import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ==========================================================
// FAZ 4A — Bölüm 18/20: misafir (guest) sepeti kimliklendirme.
//
// "localStorage'ı TEK BAŞINA source of truth olarak kullanma" talimatı
// gereği: gerçek kimlik HttpOnly + secure cookie'de taşınan rastgele bir
// `sessionToken`dir (Cart.sessionToken, zaten FAZ3'te @unique olarak
// eklenmişti) — DB bunun sahibi, cookie yalnızca "hangi Cart satırı"
// referansını taşır. Yeni bir npm bağımlılığı (uuid vb.) EKLENMEDİ — Node'un
// yerleşik `crypto.randomUUID()` kullanıldı (Bölüm 31 — yeni harici servis
// ekleme talimatıyla tutarlı).
//
// Cookie okuma/yazma BİLEREK `next/headers`'ın `cookies()` fonksiyonu
// yerine, route handler'a zaten parametre olarak gelen `NextRequest`/
// `NextResponse`'un kendi `.cookies` API'si ile yapılıyor — ikisi
// işlevsel olarak eşdeğer ama bu, route'ların Next.js'in request-scope
// AsyncLocalStorage'ına gizli bir bağımlılık eklemesini önler ve kodu daha
// açık test edilebilir tutar.
// ==========================================================

export const GUEST_CART_COOKIE = "bm_guest_cart";
const GUEST_CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 gün

export interface ResolvedCart {
  cart: { id: string; userId: string | null; sessionToken: string | null; status: string };
  /** Set olduğunda, çağıran route response'una guest cookie'yi EKLEMELİ (bkz. attachGuestCookie). */
  newSessionToken?: string;
}

/**
 * Bölüm 9/18 — mevcut Cart/CartItem şemasını KULLANIR, yeni bir sepet
 * sistemi kurmaz. Kimliği doğrulanmış müşteri için `Cart.userId`, misafir
 * için `Cart.sessionToken` üzerinden tek bir ACTIVE sepet bulunur/oluşturulur.
 */
export async function resolveCart(req: NextRequest, customerUserId: string | null): Promise<ResolvedCart> {
  if (customerUserId) {
    const existing = await prisma.cart.findFirst({ where: { userId: customerUserId, status: "ACTIVE" } });
    if (existing) return { cart: existing };
    const created = await prisma.cart.create({ data: { userId: customerUserId, status: "ACTIVE" } });
    return { cart: created };
  }

  const token = req.cookies.get(GUEST_CART_COOKIE)?.value;
  if (token) {
    const existing = await prisma.cart.findUnique({ where: { sessionToken: token } });
    // Token bir Cart'a karşılık geliyor VE hâlâ misafir (userId null) ise
    // kullan. (Merge sonrası guest cart silindiği/token bir kullanıcıya
    // taşındığı için bu durum normalde oluşmaz — savunma amaçlı kontrol.)
    if (existing && existing.userId === null && existing.status === "ACTIVE") return { cart: existing };
  }

  const newSessionToken = crypto.randomUUID();
  const created = await prisma.cart.create({ data: { sessionToken: newSessionToken, status: "ACTIVE" } });
  return { cart: created, newSessionToken };
}

/** Yeni bir misafir sepeti oluşturulduysa (ilk ziyaret), response'a HttpOnly cookie'yi ekler. */
export function attachGuestCookie(res: NextResponse, resolved: ResolvedCart): NextResponse {
  if (resolved.newSessionToken) {
    res.cookies.set(GUEST_CART_COOKIE, resolved.newSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_CART_MAX_AGE_SECONDS,
    });
  }
  return res;
}

/** Bölüm 19 — login sonrası merge tamamlandığında guest cookie temizlenir (artık sepet userId'ye bağlı). */
export function clearGuestCookie(res: NextResponse): NextResponse {
  res.cookies.set(GUEST_CART_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
