"use client";

import { useEffect, useState } from "react";

interface Category {
  id: string;
  title: string;
  shortDescription: string | null;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  _count: { products: number };
}

export default function AdminCategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, shortDescription: newDesc || null }),
    });
    setNewTitle("");
    setNewDesc("");
    load();
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Yeni Kategori</h2>
        <form onSubmit={createCategory} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-row" style={{ flex: 1, minWidth: 180 }}>
            <label>Başlık</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
          </div>
          <div className="form-row" style={{ flex: 2, minWidth: 220 }}>
            <label>Kısa açıklama</label>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          </div>
          <button className="admin-btn" type="submit">
            Ekle
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
                <th>Kategori</th>
                <th>Açıklama</th>
                <th>Ürün Sayısı</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <i className={`fas ${c.icon ?? "fa-leaf"}`} style={{ color: c.color ?? "#E65100", marginRight: 6 }} />
                    {c.title}
                  </td>
                  <td>{c.shortDescription}</td>
                  <td>{c._count?.products ?? 0}</td>
                  <td>{c.isActive ? <span className="badge badge-green">Aktif</span> : <span className="badge badge-red">Pasif</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
