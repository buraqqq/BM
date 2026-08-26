import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { RegisterForm } from "@/components/RegisterForm";

export const metadata: Metadata = {
  title: "Kayıt Ol | B&M Vourla",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <>
      <SiteHeader />
      <RegisterForm />
    </>
  );
}
