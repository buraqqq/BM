"use client";

import { useEffect, useState, useCallback } from "react";
import { PRODUCT_ATTRIBUTE_TYPES } from "@/lib/enums";

interface Category {
  id: string;
  title: string;
  depth: number;
}
interface AttributeDefinition {
  id: string;
  key: string;
  name: string;
  type: string;
  unit: string | null;
  options: string[];
  isActive: boolean;
  categoryId: string | null;
  category: { id: string; title: string } | null;
}

const emptyForm = { categoryId: "", key: "", name: "", type: "TEXT", unit: "", options: "" };

export default function AdminAttributesPage() {
  const [items, setItems] = useState<AttributeDefinition[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/attribute-definitions")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/admin/attribute-definitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: form.categoryId || null,
        key: form.key,
        name: form.name,
        type: form.type,
        unit: form.unit || null,
        options: form.type === "SELECT" ? form.options.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? JSON.stringify(d.details) ?? "Kaydedilemedi");
      return;
    }
    setForm(emptyForm);
    load();
  }

  async function toggleActive(a: AttributeDefinition) {
    await fetch(`/api/admin/attribute-definitions/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    load();
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 6, fontFamily: "var(--font-heading)" }}>Yeni Ürün Özelliği Tanımı</h2>
        <p style={{ fontSize: "0.8rem", color: "#757575", marginBottom: 14 }}>
          Örnek: "Bitki" kategorisi için "Güneş İhtiyacı" (SELECT: Tam Güneş, Yarı Gölge, Gölge), "Hortum" kategorisi
          için "Uzunluk" (NUMBER, birim: metre). Kategori seçilmezse özellik TÜM kategorilerde kullanılabilir.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 1, minWidth: 180 }}>
              <label>Kategori (boş = tüm kategoriler)</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">— Tüm kategoriler —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"— ".repeat(c.depth)}
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 160 }}>
              <label>İnsan-okunur Ad *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Güneş İhtiyacı" />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 160 }}>
              <label>Key (makine-okunur) *</label>
              <input
                required
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                placeholder="gunes_ihtiyaci"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>Tip</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {PRODUCT_ATTRIBUTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>Birim (opsiyonel)</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="cm, °C, gün…" />
            </div>
            {form.type === "SELECT" && (
              <div className="form-row" style={{ flex: 2, minWidth: 220 }}>
                <label>Seçenekler (virgülle ayrılmış)</label>
                <input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="Tam Güneş, Yarı Gölge, Gölge" />
              </div>
            )}
          </div>
          {err && <p style={{ color: "#c0392b", marginBottom: 10 }}>{err}</p>}
          <button className="admin-btn" type="submit">
            Ekle
          </button>
        </form>
      </div>

      <div className="admin-card">
        {loading ? (
          <p>Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "#757575" }}>Henüz özellik tanımı eklenmedi.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Key</th>
                <th>Tip</th>
                <th>Kategori</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>
                    <code>{a.key}</code>
                  </td>
                  <td>
                    {a.type}
                    {a.unit ? ` (${a.unit})` : ""}
                  </td>
                  <td>{a.category?.title ?? "Tüm kategoriler"}</td>
                  <td>{a.isActive ? <span className="badge badge-green">Aktif</span> : <span className="badge badge-red">Pasif</span>}</td>
                  <td>
                    <button className="admin-btn secondary" onClick={() => toggleActive(a)}>
                      {a.isActive ? "Pasifleştir" : "Aktifleştir"}
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
