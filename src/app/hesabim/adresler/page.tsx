import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { AddressManager } from "@/components/AddressManager";

export const metadata: Metadata = {
  title: "Adreslerim | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function AddressesPage() {
  return (
    <>
      <SiteHeader />
      <AddressManager />
    </>
  );
}
