"use client";

import { useEffect, useState, useCallback } from "react";

interface Category {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  depth: number;
  isActive: boolean;
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  sortOrder: number;
  productCount?: number;
}

const emptyForm = {
  title: "",
  parentId: "",
  shortDescription: "",
  description: "",
  imageUrl: "",
  sortOrder: "0",
  isFeatured: false,
  seoTitle: "",
  seoDescription: "",
};

export default function AdminCategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  function startEdit(c: Category) {
    setEditingId(c.id);
    setForm({
      title: c.title,
      parentId: c.parentId ?? "",
      shortDescription: c.shortDescription ?? "",
      description: c.description ?? "",
      imageUrl: c.imageUrl ?? "",
      sortOrder: String(c.sortOrder),
      isFeatured: c.isFeatured,
      seoTitle: c.seoTitle ?? "",
      seoDescription: c.seoDescription ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const payload = {
      title: form.title,
      parentId: form.parentId || null,
      shortDescription: form.shortDescription || null,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      sortOrder: Number(form.sortOrder) || 0,
      isFeatured: form.isFeatured,
      seoTitle: form.seoTitle || null,
      seoDescription: form.seoDescription || null,
    };
    const res = await fetch(editingId ? `/api/admin/categories/${editingId}` : "/api/admin/categories", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? "Kaydedilemedi");
      return;
    }
    setMsg(editingId ? "Kategori güncellendi." : "Kategori oluşturuldu.");
    cancelEdit();
    load();
  }

  async function toggleActive(c: Category) {
    const res = await fetch(`/api/admin/categories/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    if (res.status === 409) {
      const d = await res.json();
      if (confirm(d.message + "\n\nDevam edilsin mi?")) {
        await fetch(`/api/admin/categories/${c.id}?force=1`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !c.isActive }),
        });
        load();
      }
      return;
    }
    load();
  }

  async function moveCategory(c: Category, newParentId: string) {
    const res = await fetch(`/api/admin/categories/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: newParentId || null }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "Taşınamadı");
    }
    load();
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>
          {editingId ? "Kategoriyi Düzenle" : "Yeni Kategori"}
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
              <label>Başlık *</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 200 }}>
              <label>Üst Kategori (boş = kök kategori)</label>
              <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">— Kök kategori —</option>
                {items
                  .filter((c) => c.id !== editingId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {"— ".repeat(c.depth)}
                      {c.title}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-row" style={{ width: 120 }}>
              <label>Sıra</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <label>Kısa Açıklama</label>
            <input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Uzun Açıklama</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Görsel URL</label>
              <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="/uploads/products/... veya harici URL" />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", marginTop: 22 }}>
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
              Öne çıkan
            </label>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>SEO Başlık</label>
              <input value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>SEO Açıklama</label>
              <input value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} />
            </div>
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
        {msg && <p style={{ color: "#2E7D32", fontSize: "0.85rem", marginBottom: 10 }}>{msg}</p>}
        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Ürün Sayısı</th>
                <th>Durum</th>
                <th>Öne Çıkan</th>
                <th>Üst Kategori</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span style={{ marginLeft: c.depth * 20 }}>
                      <i className={`fas ${c.icon ?? "fa-leaf"}`} style={{ color: c.color ?? "#E65100", marginRight: 6 }} />
                      {c.title}
                    </span>
                  </td>
                  <td>{c.productCount ?? 0}</td>
                  <td>{c.isActive ? <span className="badge badge-green">Aktif</span> : <span className="badge badge-red">Pasif</span>}</td>
                  <td>{c.isFeatured ? "★" : ""}</td>
                  <td>
                    <select value={c.parentId ?? ""} onChange={(e) => moveCategory(c, e.target.value)} style={{ fontSize: "0.78rem", padding: "4px 6px" }}>
                      <option value="">— Kök —</option>
                      {items
                        .filter((o) => o.id !== c.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {"— ".repeat(o.depth)}
                            {o.title}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="admin-btn secondary" onClick={() => startEdit(c)}>
                      Düzenle
                    </button>
                    <button className="admin-btn secondary" onClick={() => toggleActive(c)}>
                      {c.isActive ? "Pasifleştir" : "Aktifleştir"}
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
