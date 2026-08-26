import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { AccountProfile } from "@/components/AccountProfile";

export const metadata: Metadata = {
  title: "Hesabım | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <AccountProfile />
    </>
  );
}
