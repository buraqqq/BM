import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { CartPage } from "@/components/CartPage";

export const metadata: Metadata = {
  title: "Sepetim | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function CartRoutePage() {
  return (
    <>
      <SiteHeader />
      <CartPage />
    </>
  );
}
