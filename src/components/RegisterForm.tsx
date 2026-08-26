"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { notifyCartUpdated } from "@/components/CartBadge";

// FAZ 4A — Bölüm 2: kayıt formu. Sunucu tarafı zaten tüm gerçek doğrulamayı
// yapıyor (bkz. /api/account/register) — buradaki client-side kontroller
// yalnızca hızlı geri bildirim, GÜVENLİK KARARI DEĞİL.
export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", surname: "", email: "", phone: "", password: "", passwordConfirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.passwordConfirm) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/account/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        surname: form.surname,
        email: form.email,
        phone: form.phone,
        password: form.password,
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setLoading(false);
      if (res.status === 409) setError("Bu e-posta adresi zaten kayıtlı.");
      else if (data?.details?.fieldErrors) {
        const firstError = Object.values(data.details.fieldErrors as Record<string, string[]>).flat()[0];
        setError(firstError ?? "Bilgileriniz kontrol edilemedi.");
      } else setError("Kayıt oluşturulamadı, lütfen bilgilerinizi kontrol edin.");
      return;
    }

    // Kayıt sonrası otomatik giriş (aynı, mevcut NextAuth akışı) + guest cart merge.
    await signIn("customer-credentials", { email: form.email, password: form.password, redirect: false });
    try {
      await fetch("/api/cart/merge", { method: "POST" });
      notifyCartUpdated();
    } catch {
      // merge başarısız olsa bile kayıt/login başarılı
    }
    router.push("/hesabim");
    router.refresh();
  }

  return (
    <div className="account-shell">
      <div className="account-card">
        <h1>Kayıt Ol</h1>
        <p className="account-sub">Ücretsiz hesap oluşturun.</p>
        <form className="account-form" onSubmit={handleSubmit}>
          <div className="account-form-row">
            <div>
              <label htmlFor="name">Ad</label>
              <input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} required />
            </div>
            <div>
              <label htmlFor="surname">Soyad</label>
              <input id="surname" value={form.surname} onChange={(e) => update("surname", e.target.value)} required />
            </div>
          </div>
          <div>
            <label htmlFor="email">E-posta</label>
            <input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="phone">Telefon</label>
            <input id="phone" type="tel" placeholder="05XX XXX XX XX" value={form.phone} onChange={(e) => update("phone", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="password">Şifre</label>
            <input id="password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" required />
          </div>
          <div>
            <label htmlFor="passwordConfirm">Şifre (Tekrar)</label>
            <input
              id="passwordConfirm"
              type="password"
              value={form.passwordConfirm}
              onChange={(e) => update("passwordConfirm", e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {error && <p className="account-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: "center" }}>
            {loading ? "Kayıt oluşturuluyor…" : "Kayıt Ol"}
          </button>
        </form>
        <p className="account-links">
          Zaten hesabınız var mı? <a href="/giris">Giriş Yapın</a>
        </p>
      </div>
    </div>
  );
}
