"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { notifyCartUpdated } from "@/components/CartBadge";

// FAZ 4A — Bölüm 3: müşteri girişi. src/app/admin/login/page.tsx ile AYNI
// desen (signIn + redirect:false + hata mesajı) — "yeni ikinci
// authentication mekanizması" değil, AYNI NextAuth client API'si, farklı
// provider id ("customer-credentials", bkz. src/lib/auth.ts).
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("customer-credentials", { email, password, redirect: false });
    if (res?.error) {
      setLoading(false);
      // Bölüm 3 — genel hata mesajı, kullanıcı var/yok bilgisi sızdırılmaz.
      setError(res.error === "RATE_LIMITED" ? "Çok fazla başarısız deneme. Lütfen birkaç dakika sonra tekrar deneyin." : "E-posta veya şifre hatalı.");
      return;
    }

    // Bölüm 19 — login sonrası guest sepeti kullanıcı sepetiyle birleştir.
    try {
      await fetch("/api/cart/merge", { method: "POST" });
      notifyCartUpdated();
    } catch {
      // merge başarısız olsa bile login başarılı — kullanıcıyı bloklamıyoruz
    }

    const next = searchParams.get("next") || "/hesabim";
    router.push(next);
    router.refresh();
  }

  return (
    <div className="account-shell">
      <div className="account-card">
        <h1>Giriş Yap</h1>
        <p className="account-sub">Hesabınıza giriş yaparak adreslerinizi yönetin, sepetinizi cihazlar arası taşıyın.</p>
        <form className="account-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email">E-posta</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="password">Şifre</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          {error && <p className="account-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: "center" }}>
            {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
          </button>
        </form>
        <p className="account-links">
          Hesabınız yok mu? <a href="/kayit">Kayıt Olun</a>
        </p>
      </div>
    </div>
  );
}
