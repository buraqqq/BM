"use client";

import { useEffect, useState, useCallback } from "react";

interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  isActive: boolean;
  productCount?: number;
}

const emptyForm = { name: "", logoUrl: "", description: "", website: "" };

export default function AdminBrandsPage() {
  const [items, setItems] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/brands")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  function startEdit(b: Brand) {
    setEditingId(b.id);
    setForm({ name: b.name, logoUrl: b.logoUrl ?? "", description: b.description ?? "", website: b.website ?? "" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const payload = {
      name: form.name,
      logoUrl: form.logoUrl || null,
      description: form.description || null,
      website: form.website || null,
    };
    const res = await fetch(editingId ? `/api/admin/brands/${editingId}` : "/api/admin/brands", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? "Kaydedilemedi");
      return;
    }
    cancelEdit();
    load();
  }

  async function toggleActive(b: Brand) {
    await fetch(`/api/admin/brands/${b.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    load();
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>{editingId ? "Markayı Düzenle" : "Yeni Marka"}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
              <label>Marka Adı *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
              <label>Web Sitesi</label>
              <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <div className="form-row">
            <label>Logo URL</label>
            <input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Açıklama</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {err && <p style={{ color: "#c0392b", marginBottom: 10 }}>{err}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="admin-btn" type="submit">
              {editingId ? "Güncelle" : "Ekle"}
            </button>
            {editingId && (
              <button type="button" className="admin-btn secondary" onClick={cancelEdit}>
                İptal
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="admin-card">
        {loading ? (
          <p>Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "#757575" }}>Henüz marka eklenmedi.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Marka</th>
                <th>Web Sitesi</th>
                <th>Ürün Sayısı</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.website}</td>
                  <td>{b.productCount ?? 0}</td>
                  <td>{b.isActive ? <span className="badge badge-green">Aktif</span> : <span className="badge badge-red">Pasif</span>}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="admin-btn secondary" onClick={() => startEdit(b)}>
                      Düzenle
                    </button>
                    <button className="admin-btn secondary" onClick={() => toggleActive(b)}>
                      {b.isActive ? "Pasifleştir" : "Aktifleştir"}
                    </button>
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
