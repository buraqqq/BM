import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { LoginForm } from "@/components/LoginForm";

// FAZ 4A — Bölüm 32: hesap sayfaları noindex, sitemap'e eklenmez.
export const metadata: Metadata = {
  title: "Giriş Yap | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      {/* LoginForm useSearchParams() kullanıyor (?next= yönlendirme
          parametresi) — Next.js App Router bunu bir Suspense sınırı içinde
          bekliyor. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </>
  );
}
