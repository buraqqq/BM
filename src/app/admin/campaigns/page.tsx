"use client";

import { useEffect, useState } from "react";

interface Category {
  id: string;
  title: string;
}
interface Campaign {
  id: string;
  name: string;
  discountType: string;
  discountValue: number;
  scope: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isCurrentlyActive: boolean;
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AdminCampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED_AMOUNT",
    discountValue: "20",
    scope: "GLOBAL" as "GLOBAL" | "CATEGORY",
    categoryId: "",
    startDate: toInputDate(new Date()),
    endDate: toInputDate(new Date(Date.now() + 10 * 86400000)),
    bannerText: "",
  });

  function load() {
    setLoading(true);
    fetch("/api/admin/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        scope: form.scope,
        categoryId: form.scope === "CATEGORY" ? form.categoryId : undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        bannerText: form.bannerText || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message ?? JSON.stringify(d.details) ?? "Kampanya oluşturulamadı");
      return;
    }
    setForm({ ...form, name: "", bannerText: "" });
    load();
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Yeni Kampanya</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 2, minWidth: 200 }}>
              <label>Kampanya Adı *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Yaz Bahçe Fırsatları" />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>İndirim Tipi</label>
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as "PERCENTAGE" | "FIXED_AMOUNT" })}>
                <option value="PERCENTAGE">Yüzde (%)</option>
                <option value="FIXED_AMOUNT">Sabit Tutar (TL)</option>
              </select>
            </div>
            <div className="form-row" style={{ width: 100 }}>
              <label>Değer</label>
              <input type="number" min="0" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>Kapsam</label>
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as "GLOBAL" | "CATEGORY" })}>
                <option value="GLOBAL">Tüm ürünler</option>
                <option value="CATEGORY">Belirli kategori</option>
              </select>
            </div>
            {form.scope === "CATEGORY" && (
              <div className="form-row" style={{ flex: 1, minWidth: 180 }}>
                <label>Kategori</label>
                <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Seçin…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>Başlangıç</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>Bitiş</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <label>Banner Metni (opsiyonel)</label>
            <input value={form.bannerText} onChange={(e) => setForm({ ...form, bannerText: e.target.value })} placeholder="Yaz Bahçe Fırsatları — Seçili ürünlerde %20 indirim!" />
          </div>

          {error && <p style={{ color: "#c0392b", marginBottom: 10 }}>{error}</p>}
          <button type="submit" className="admin-btn">
            Kampanyayı Oluştur
          </button>
        </form>
      </div>

      <div className="admin-card">
        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kampanya</th>
                <th>İndirim</th>
                <th>Kapsam</th>
                <th>Tarih Aralığı</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.discountType === "PERCENTAGE" ? `%${c.discountValue}` : `${c.discountValue} TL`}</td>
                  <td>{c.scope}</td>
                  <td>
                    {c.startDate.slice(0, 10)} → {c.endDate.slice(0, 10)}
                  </td>
                  <td>
                    {c.isCurrentlyActive ? (
                      <span className="badge badge-green">Şu an aktif</span>
                    ) : c.isActive ? (
                      <span className="badge badge-yellow">Tarih dışı</span>
                    ) : (
                      <span className="badge badge-red">Kapalı</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
