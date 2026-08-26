"use client";

import { useEffect, useState, useCallback } from "react";

interface AdminProduct {
  id: string;
  name: string;
  sku: string;
  stock: number;
  stockStatus: string;
  category: { title: string };
}

export default function AdminInventoryPage() {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function adjust(productId: string, delta: number) {
    setBusyId(productId);
    const res = await fetch(`/api/admin/inventory/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: delta, type: "ADJUSTMENT", reason: "admin panel hızlı düzeltme" }),
    });
    setBusyId(null);
    if (res.ok) load();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "İşlem başarısız");
    }
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <div className="filters-row">
          <input placeholder="Ürün / SKU ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ürün</th>
                <th>SKU</th>
                <th>Kategori</th>
                <th>Stok</th>
                <th>Durum</th>
                <th>Hızlı Düzelt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.sku}</td>
                  <td>{p.category?.title}</td>
                  <td>{p.stock}</td>
                  <td>
                    {p.stockStatus === "IN_STOCK" && <span className="badge badge-green">Stokta</span>}
                    {p.stockStatus === "LOW_STOCK" && <span className="badge badge-yellow">Az</span>}
                    {p.stockStatus === "OUT_OF_STOCK" && <span className="badge badge-red">Tükendi</span>}
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="admin-btn secondary" disabled={busyId === p.id} onClick={() => adjust(p.id, -1)}>
                      -1
                    </button>
                    <button className="admin-btn secondary" disabled={busyId === p.id} onClick={() => adjust(p.id, +1)}>
                      +1
                    </button>
                    <button className="admin-btn secondary" disabled={busyId === p.id} onClick={() => adjust(p.id, +10)}>
                      +10
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
