"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

interface Profile {
  id: string;
  name: string | null;
  surname: string | null;
  email: string;
  phone: string | null;
  createdAt: string;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

// FAZ 4A — Bölüm 4/5: /hesabim — profil görüntüleme/güncelleme + şifre
// değiştirme. Oturum yoksa client-side /giris'e yönlendirir (bkz. dosya
// başlığındaki genel not — bu proje middleware.ts kullanmıyor, admin panel
// de AYNI şekilde client-side session kontrolüyle çalışıyor).
export function AccountProfile() {
  const router = useRouter();
  const { status } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ name: "", surname: "", phone: "", email: "" });
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", newPasswordConfirmation: "" });
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/giris?next=/hesabim");
      return;
    }
    if (status !== "authenticated") return;
    fetch("/api/account/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Profile) => {
        setProfile(data);
        setForm({ name: data.name ?? "", surname: data.surname ?? "", phone: data.phone ?? "", email: data.email });
      })
      .catch(() => router.push("/giris?next=/hesabim"));
  }, [status, router]);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);
    const res = await fetch("/api/account/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    setProfileSaving(false);
    if (!res.ok) {
      setProfileMsg({ type: "err", text: res.status === 409 ? "Bu e-posta adresi zaten kullanımda." : "Güncelleme başarısız oldu." });
      return;
    }
    setProfile(data);
    setProfileMsg({ type: "ok", text: "Profiliniz güncellendi." });
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pwForm.newPassword !== pwForm.newPasswordConfirmation) {
      setPwMsg({ type: "err", text: "Yeni şifre ve onayı eşleşmiyor." });
      return;
    }
    setPwSaving(true);
    const res = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pwForm),
    });
    const data = await res.json().catch(() => null);
    setPwSaving(false);
    if (!res.ok) {
      setPwMsg({ type: "err", text: data?.message ?? "Şifre değiştirilemedi." });
      return;
    }
    setPwMsg({ type: "ok", text: "Şifreniz güncellendi." });
    setPwForm({ currentPassword: "", newPassword: "", newPasswordConfirmation: "" });
  }

  if (status === "loading" || !profile) {
    return (
      <div className="account-shell">
        <p className="account-sub">Yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="account-shell wide">
      <div className="account-nav-links">
        <a className="active" href="/hesabim">
          Profilim
        </a>
        <a href="/hesabim/adresler">Adreslerim</a>
        <a href="/hesabim/siparislerim">SipariÅŸlerim</a>
        <a href="/hesabim/alarmlar">Alarmlarım</a>
        <a href="/sepet">Sepetim</a>
        <button
          onClick={async () => {
            await signOut({ redirect: false });
            router.push("/");
            router.refresh();
          }}
        >
          Çıkış Yap
        </button>
      </div>

      <div className="account-card" style={{ marginBottom: 20 }}>
        <h2>Hesap Bilgileri</h2>
        <div className="account-info-row">
          <span>Üyelik Tarihi</span>
          <span>{formatDate(profile.createdAt)}</span>
        </div>

        <form className="account-form" onSubmit={handleProfileSubmit} style={{ marginTop: 18 }}>
          <div className="account-form-row">
            <div>
              <label htmlFor="p-name">Ad</label>
              <input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="p-surname">Soyad</label>
              <input id="p-surname" value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} required />
            </div>
          </div>
          <div>
            <label htmlFor="p-email">E-posta</label>
            <input id="p-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="p-phone">Telefon</label>
            <input id="p-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </div>
          {profileMsg && <p className={profileMsg.type === "ok" ? "account-success" : "account-error"}>{profileMsg.text}</p>}
          <button className="btn btn-primary" type="submit" disabled={profileSaving} style={{ justifyContent: "center", alignSelf: "flex-start" }}>
            {profileSaving ? "Kaydediliyor…" : "Bilgileri Güncelle"}
          </button>
        </form>
      </div>

      <div className="account-card">
        <h2>Şifre Değiştir</h2>
        <form className="account-form" onSubmit={handlePasswordSubmit} style={{ marginTop: 10 }}>
          <div>
            <label htmlFor="pw-current">Mevcut Şifre</label>
            <input
              id="pw-current"
              type="password"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label htmlFor="pw-new">Yeni Şifre</label>
            <input
              id="pw-new"
              type="password"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label htmlFor="pw-confirm">Yeni Şifre (Tekrar)</label>
            <input
              id="pw-confirm"
              type="password"
              value={pwForm.newPasswordConfirmation}
              onChange={(e) => setPwForm({ ...pwForm, newPasswordConfirmation: e.target.value })}
              autoComplete="new-password"
              required
            />
          </div>
          {pwMsg && <p className={pwMsg.type === "ok" ? "account-success" : "account-error"}>{pwMsg.text}</p>}
          <button className="btn btn-primary" type="submit" disabled={pwSaving} style={{ justifyContent: "center", alignSelf: "flex-start" }}>
            {pwSaving ? "Kaydediliyor…" : "Şifreyi Değiştir"}
          </button>
        </form>
      </div>
    </div>
  );
}
