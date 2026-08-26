import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Bölüm 7/21 — /admin/* sayfaları (login hariç) session olmadan erişilemez.
// API tarafında zaten requireAdmin() ile ayrıca korunuyor (defense in depth).
export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    pages: { signIn: "/admin/login" },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/admin/((?!login).*)"],
};
