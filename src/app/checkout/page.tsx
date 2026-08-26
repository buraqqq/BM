import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { CheckoutPage } from "@/components/CheckoutPage";

// FAZ 4B — Bölüm 32: hesap/sepet sayfalarıyla aynı kural — checkout noindex,
// sitemap'e eklenmez.
export const metadata: Metadata = {
  title: "Checkout | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function Checkout() {
  return (
    <>
      <SiteHeader />
      <CheckoutPage />
    </>
  );
}
