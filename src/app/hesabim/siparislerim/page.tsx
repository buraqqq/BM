import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { OrderHistoryPage } from "@/components/OrderHistoryPage";

export const metadata: Metadata = {
  title: "Siparişlerim | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function OrderHistory() {
  return (
    <>
      <SiteHeader />
      <OrderHistoryPage />
    </>
  );
}
