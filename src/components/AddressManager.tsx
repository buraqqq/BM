"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface Address {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  neighborhood: string | null;
  addressLine: string;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
}

const EMPTY_FORM = {
  title: "",
  firstName: "",
  lastName: "",
  phone: "",
  city: "",
  district: "",
  neighborhood: "",
  addressLine: "",
  postalCode: "",
  country: "Türkiye",
  isDefault: false,
};

// FAZ 4A — Bölüm 6/7: /hesabim/adresler — adres CRUD + varsayılan adres
// seçimi. Tüm invariant garantisi (aynı anda tek isDefault) SERVER-SIDE
// (/api/account/addresses*, bkz. address-rules.ts) — bu bileşen yalnızca
// sunucunun döndürdüğü sonucu gösterir.
export function AddressManager() {
  const router = useRouter();
  const { status } = useSession();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAddresses() {
    const res = await fetch("/api/account/addresses", { cache: "no-store" });
    if (!res.ok) {
      router.push("/giris?next=/hesabim/adresler");
      return;
    }
    const data = await res.json();
    setAddresses(data.items);
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/giris?next=/hesabim/adresler");
      return;
    }
    if (status === "authenticated") loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function openNewForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setShowForm(true);
  }

  function openEditForm(a: Address) {
    setForm({
      title: a.title,
      firstName: a.firstName,
      lastName: a.lastName,
      phone: a.phone,
      city: a.city,
      district: a.district,
      neighborhood: a.neighborhood ?? "",
      addressLine: a.addressLine,
      postalCode: a.postalCode ?? "",
      country: a.country,
      isDefault: a.isDefault,
    });
    setEditingId(a.id);
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const url = editingId ? `/api/account/addresses/${editingId}` : "/api/account/addresses";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) {
      setError("Adres kaydedilemedi, lütfen bilgileri kontrol edin.");
      return;
    }
    setShowForm(false);
    loadAddresses();
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu adresi silmek istediğinize emin misiniz?")) return;
    await fetch(`/api/account/addresses/${id}`, { method: "DELETE" });
    loadAddresses();
  }

  async function handleSetDefault(id: string) {
    await fetch(`/api/account/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    loadAddresses();
  }

  return (
    <div className="account-shell wide">
      <div className="account-nav-links">
        <a href="/hesabim">Profilim</a>
        <a className="active" href="/hesabim/adresler">
          Adreslerim
        </a>
        <a href="/sepet">Sepetim</a>
      </div>

      <div className="account-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Adreslerim</h2>
          <button className="btn btn-primary" onClick={openNewForm} type="button">
            <i className="fas fa-plus" /> Yeni Adres Ekle
          </button>
        </div>

        {addresses === null && <p className="account-sub">Yükleniyor…</p>}
        {addresses?.length === 0 && <p className="account-sub" style={{ marginTop: 16 }}>Henüz kayıtlı adresiniz yok.</p>}

        <div className="address-grid">
          {addresses?.map((a) => (
            <div key={a.id} className={`address-card${a.isDefault ? " is-default" : ""}`}>
              {a.isDefault && <span className="address-default-tag">Varsayılan</span>}
              <h3>{a.title}</h3>
              <p>
                {a.firstName} {a.lastName} — {a.phone}
                <br />
                {a.addressLine}
                <br />
                {a.neighborhood ? `${a.neighborhood}, ` : ""}
                {a.district}/{a.city} {a.postalCode ?? ""}
                <br />
                {a.country}
              </p>
              <div className="address-card-actions">
                <button type="button" onClick={() => openEditForm(a)}>
                  Düzenle
                </button>
                {!a.isDefault && (
                  <button type="button" onClick={() => handleSetDefault(a.id)}>
                    Varsayılan Yap
                  </button>
                )}
                <button type="button" className="danger" onClick={() => handleDelete(a.id)}>
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="account-card" style={{ marginTop: 20 }}>
          <h2>{editingId ? "Adresi Düzenle" : "Yeni Adres"}</h2>
          <form className="account-form" onSubmit={handleSubmit}>
            <div className="account-form-row">
              <div>
                <label htmlFor="a-title">Adres Başlığı</label>
                <input id="a-title" placeholder="Ev, İş vb." value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="a-phone">Telefon</label>
                <input id="a-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </div>
            </div>
            <div className="account-form-row">
              <div>
                <label htmlFor="a-firstName">Ad</label>
                <input id="a-firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="a-lastName">Soyad</label>
                <input id="a-lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </div>
            </div>
            <div className="account-form-row">
              <div>
                <label htmlFor="a-city">İl</label>
                <input id="a-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="a-district">İlçe</label>
                <input id="a-district" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} required />
              </div>
            </div>
            <div>
              <label htmlFor="a-neighborhood">Mahalle</label>
              <input id="a-neighborhood" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
            </div>
            <div>
              <label htmlFor="a-addressLine">Açık Adres</label>
              <textarea id="a-addressLine" rows={3} value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} required />
            </div>
            <div className="account-form-row">
              <div>
                <label htmlFor="a-postalCode">Posta Kodu</label>
                <input id="a-postalCode" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
              </div>
              <div>
                <label htmlFor="a-country">Ülke</label>
                <input id="a-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required />
              </div>
            </div>
            <label className="filter-checkbox" style={{ minHeight: "auto" }}>
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Varsayılan adresim olsun
            </label>
            {error && <p className="account-error">{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <button
                type="button"
                className="account-nav-links"
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", padding: "9px 16px", borderRadius: 50, cursor: "pointer" }}
                onClick={() => setShowForm(false)}
              >
                Vazgeç
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
