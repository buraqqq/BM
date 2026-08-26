"use client";

import { useEffect, useState, useCallback } from "react";

interface AdminProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  category: { id: string; title: string };
}
interface Category {
  id: string;
  title: string;
}

export default function AdminPricingPage() {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Toplu revizyon (Bölüm 16)
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkType, setBulkType] = useState<"PERCENT_INCREASE" | "PERCENT_DECREASE" | "FIXED_INCREASE" | "FIXED_DECREASE">(
    "PERCENT_INCREASE"
  );
  const [bulkValue, setBulkValue] = useState("10");
  const [bulkPreview, setBulkPreview] = useState<{ affectedCount: number; preview: { name: string; oldPrice: number; newPrice: number }[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "100" });
    if (search) params.set("search", search);
    fetch(`/api/admin/products?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }, [search]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function savePrice(id: string) {
    const value = editing[id];
    if (value === undefined) return;
    setSavingId(id);
    const res = await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: Number(value), reason: "admin panel — pricing ekranı" }),
    });
    setSavingId(null);
    if (res.ok) {
      setMsg("Fiyat güncellendi ve audit log'a kaydedildi.");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "Fiyat güncellenemedi");
    }
  }

  async function runBulkPreview() {
    setBulkBusy(true);
    const res = await fetch("/api/admin/products/bulk-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: bulkCategoryId || undefined,
        adjustment: { type: bulkType, value: Number(bulkValue) },
        dryRun: true,
      }),
    });
    setBulkBusy(false);
    const data = await res.json();
    if (res.ok) setBulkPreview(data);
    else alert(data.message ?? "Önizleme başarısız");
  }

  async function applyBulk() {
    if (!confirm(`${bulkPreview?.affectedCount ?? 0} ürünün fiyatı güncellensin mi?`)) return;
    setBulkBusy(true);
    const res = await fetch("/api/admin/products/bulk-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: bulkCategoryId || undefined,
        adjustment: { type: bulkType, value: Number(bulkValue) },
        dryRun: false,
      }),
    });
    setBulkBusy(false);
    if (res.ok) {
      setBulkPreview(null);
      setMsg("Toplu fiyat revizyonu uygulandı.");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "İşlem başarısız");
    }
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Toplu Fiyat Revizyonu (Bölüm 16)</h2>
        <div className="filters-row">
          <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
            <option value="">Kategori seçin…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select value={bulkType} onChange={(e) => setBulkType(e.target.value as typeof bulkType)}>
            <option value="PERCENT_INCREASE">Yüzde Artış (+%)</option>
            <option value="PERCENT_DECREASE">Yüzde İndirim (-%)</option>
            <option value="FIXED_INCREASE">Sabit Artış (+TL)</option>
            <option value="FIXED_DECREASE">Sabit İndirim (-TL)</option>
          </select>
          <input type="number" min="0" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={{ width: 100 }} />
          <button className="admin-btn secondary" onClick={runBulkPreview} disabled={!bulkCategoryId || bulkBusy}>
            Önizle
          </button>
        </div>
        {bulkPreview && (
          <div>
            <p style={{ marginBottom: 8 }}>
              <strong>{bulkPreview.affectedCount}</strong> ürün etkilenecek. İlk {bulkPreview.preview.length} kayıt:
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Eski Fiyat</th>
                  <th>Yeni Fiyat</th>
                </tr>
              </thead>
              <tbody>
                {bulkPreview.preview.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td>{p.oldPrice} TL</td>
                    <td>{p.newPrice} TL</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="admin-btn" style={{ marginTop: 12 }} onClick={applyBulk} disabled={bulkBusy}>
              Uygula
            </button>
          </div>
        )}
      </div>

      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Tekil Fiyat Değişikliği</h2>
        <div className="filters-row">
          <input placeholder="Ürün / SKU ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {msg && <p style={{ color: "#2E7D32", fontSize: "0.85rem", marginBottom: 10 }}>{msg}</p>}
        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ürün</th>
                <th>Kategori</th>
                <th>Fiyat (TL)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category?.title}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: 100 }}
                      value={editing[p.id] ?? String(p.price)}
                      onChange={(e) => setEditing({ ...editing, [p.id]: e.target.value })}
                    />
                  </td>
                  <td>
                    <button className="admin-btn secondary" disabled={savingId === p.id} onClick={() => savePrice(p.id)}>
                      Kaydet
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
