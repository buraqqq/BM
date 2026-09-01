import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Bölüm 7/21 — /admin/* sayfaları (login hariç) session olmadan erişilemez.
// API tarafında zaten requireAdmin() ile ayrıca korunuyor (defense in depth).
//
// Güncelleme (adversarial inceleme, 2026-09): Bu middleware artık iki işi
// birden yapıyor:
//   1) /admin/* rota koruması — önceden next-auth/middleware'in withAuth()
//      sarmalayıcısıyla yapılıyordu; CSP nonce enjeksiyonuyla birlikte
//      kullanmak withAuth'un response tipiyle uğraşmayı gerektirdiğinden,
//      NextAuth'un asıl önerdiği, daha şeffaf yöntem olan next-auth/jwt'nin
//      getToken() fonksiyonuna geçildi (withAuth zaten arka planda bunu
//      kullanıyor — davranış değişmedi, sadece kontrol elimizde).
//      Not: session hem admin hem müşteri (customer) girişini aynı JWT
//      altyapısıyla taşıdığı için (bkz. src/lib/auth.ts, `kind` alanı),
//      burada sadece "geçerli bir oturum var mı" değil, "kind === admin
//      mi" kontrol ediliyor — bir müşteri oturumuyla /admin/* rotalarına
//      girilebilmesi (middleware seviyesinde) önceki haliyle mümkündü,
//      requireAdmin() ile API'lerde engelleniyordu; burada da kapatıldı.
//   2) Content-Security-Policy — her istek için rastgele üretilen bir nonce
//      ile uygulanıyor (script-src'te 'unsafe-inline' yerine 'nonce-...').
//      next.config.js'deki statik CSP header'ı kaldırıldı; tek kaynak burasıdır.
const isProd = process.env.NODE_ENV === "production";

function buildCsp(nonce: string): string {
  // Prod: 'strict-dynamic' + nonce, script-src'te 'unsafe-inline'/'unsafe-eval' YOK.
  // Dev: Next.js Fast Refresh/HMR eval() kullandığı için 'unsafe-eval' gerekli,
  //      yoksa geliştirme sunucusu konsolda CSP ihlalleriyle dolar / çalışmaz.
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'unsafe-eval'`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Admin rota koruması (login sayfası hariç)
  const isAdminRoute = pathname.startsWith("/admin") && pathname !== "/admin/login";
  if (isAdminRoute) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.kind !== "admin") {
      const loginUrl = new URL("/admin/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 2) CSP nonce — eşleşen tüm rotalarda
  const nonce = crypto.randomUUID();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // _next statik/​image dosyaları, favicon, PWA ikon/manifest/sw.js hariç
  // hemen hemen tüm rotalarda çalışır (CSP header'ı bunlar için gereksiz).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js).*)"],
};
