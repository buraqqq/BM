import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { OrderDetailPage } from "@/components/OrderDetailPage";

// FAZ 4C — Bölüm I: sipariş başarı/detay sayfası. noindex (hesap içeriği).
export const metadata: Metadata = {
  title: "Sipariş Detayı | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function OrderDetail({ params }: { params: { orderNumber: string } }) {
  return (
    <>
      <SiteHeader />
      <OrderDetailPage orderNumber={params.orderNumber} />
    </>
  );
}
