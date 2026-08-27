import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { MyAlerts } from "@/components/MyAlerts";

export const metadata: Metadata = {
  title: "Alarmlarım | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function AlertsPage() {
  return (
    <>
      <SiteHeader />
      <MyAlerts />
    </>
  );
}
