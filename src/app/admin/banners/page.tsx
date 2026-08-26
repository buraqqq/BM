"use client";

import { useEffect, useState } from "react";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  startDate: string;
  endDate: string;
  priority: number;
  isActive: boolean;
  isCurrentlyVisible: boolean;
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AdminBannersPage() {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    imageUrl: "",
    ctaText: "",
    ctaLink: "",
    startDate: toInputDate(new Date()),
    endDate: toInputDate(new Date(Date.now() + 14 * 86400000)),
    priority: "0",
  });

  function load() {
    setLoading(true);
    fetch("/api/admin/banners")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }
  useEffect(load, []);

  async function handleUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "banners");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) {
      const data = await res.json();
      setForm((f) => ({ ...f, imageUrl: data.url }));
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "Yükleme başarısız");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.imageUrl) {
      setError("Görsel yüklemeniz gerekiyor.");
      return;
    }
    const res = await fetch("/api/admin/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        subtitle: form.subtitle || undefined,
        imageUrl: form.imageUrl,
        ctaText: form.ctaText || undefined,
        ctaLink: form.ctaLink || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        priority: Number(form.priority),
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message ?? "Banner oluşturulamadı");
      return;
    }
    setForm({ ...form, title: "", subtitle: "", imageUrl: "", ctaText: "", ctaLink: "" });
    load();
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Yeni Banner</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Başlık *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Alt Başlık</label>
            <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Görsel *</label>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            {uploading && <small>Yükleniyor…</small>}
            {form.imageUrl && <small style={{ color: "#2E7D32" }}>Yüklendi: {form.imageUrl}</small>}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>CTA Metni</label>
              <input value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} placeholder="Kampanyayı Gör" />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>CTA Linki</label>
              <input value={form.ctaLink} onChange={(e) => setForm({ ...form, ctaLink: e.target.value })} placeholder="#kategoriler" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Başlangıç</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Bitiş</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div className="form-row" style={{ width: 100 }}>
              <label>Öncelik</label>
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            </div>
          </div>
          {error && <p style={{ color: "#c0392b", marginBottom: 10 }}>{error}</p>}
          <button className="admin-btn" type="submit">
            Bannerı Oluştur
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
                <th>Başlık</th>
                <th>Tarih Aralığı</th>
                <th>Öncelik</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>{b.title}</td>
                  <td>
                    {b.startDate.slice(0, 10)} → {b.endDate.slice(0, 10)}
                  </td>
                  <td>{b.priority}</td>
                  <td>
                    {b.isCurrentlyVisible ? (
                      <span className="badge badge-green">Sitede görünüyor</span>
                    ) : b.isActive ? (
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
