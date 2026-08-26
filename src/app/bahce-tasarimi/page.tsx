import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { GardenDesignerPage } from "@/components/GardenDesignerPage";

export const metadata: Metadata = {
  title: "AI Bahçe Tasarımı | B&M Vourla",
  description:
    "Alanınızı tanımlayın; bölgeleme, ihtiyaç listesi ve envanter + partner ürün önerisi otomatik oluşturulsun.",
};

export default function GardenDesigner() {
  return (
    <>
      <SiteHeader />
      <GardenDesignerPage />
    </>
  );
}
