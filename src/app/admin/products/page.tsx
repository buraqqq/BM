"use client";

import { useEffect, useState, useCallback } from "react";

interface AdminProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  isActive: boolean;
  stock: number;
  stockStatus: string;
  category: { id: string; title: string };
}
interface Category {
  id: string;
  title: string;
}

export default function AdminProductsPage() {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [active, setActive] = useState("");
  const [stock, setStock] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryId) params.set("categoryId", categoryId);
    if (active) params.set("active", active);
    if (stock) params.set("stock", stock);
    params.set("pageSize", "100");
    const res = await fetch(`/api/admin/products?${params.toString()}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [search, categoryId, active, stock]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkArchive(isActiveValue: boolean) {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} ürün ${isActiveValue ? "aktif" : "pasif"} yapılsın mı?`)) return;
    await Promise.all(
      [...selected].map((id) =>
        fetch(`/api/admin/products/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: isActiveValue, reason: "bulk-action" }),
        })
      )
    );
    setSelected(new Set());
    setMsg(`${selected.size} ürün güncellendi.`);
    load();
  }

  return (
    <div className="admin-container">
      <div className="stat-cards">
        <div className="stat-card">
          <div className="num">{total}</div>
          <div className="label">Toplam Ürün (filtreli)</div>
        </div>
      </div>

      <div className="admin-card">
        <div className="filters-row">
          <input placeholder="Ürün adı / SKU ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tüm kategoriler</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="">Tüm durumlar</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
          <select value={stock} onChange={(e) => setStock(e.target.value)}>
            <option value="">Tüm stok durumları</option>
            <option value="in">Stokta</option>
            <option value="low">Az stok</option>
            <option value="out">Tükendi</option>
          </select>
          <a href="/admin/products/new" className="admin-btn">
            + Yeni Ürün
          </a>
        </div>

        {selected.size > 0 && (
          <div className="filters-row">
            <span>{selected.size} seçili</span>
            <button className="admin-btn secondary" onClick={() => bulkArchive(false)}>
              Seçilenleri Pasif Yap
            </button>
            <button className="admin-btn secondary" onClick={() => bulkArchive(true)}>
              Seçilenleri Aktif Yap
            </button>
          </div>
        )}
        {msg && <p style={{ color: "#2E7D32", fontSize: "0.85rem", marginBottom: 10 }}>{msg}</p>}

        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Ürün</th>
                  <th>SKU</th>
                  <th>Kategori</th>
                  <th>Fiyat</th>
                  <th>Stok</th>
                  <th>Durum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td>{p.name}</td>
                    <td>{p.sku}</td>
                    <td>{p.category?.title}</td>
                    <td>{p.price.toLocaleString("tr-TR")} TL</td>
                    <td>
                      {p.stock}{" "}
                      {p.stockStatus === "OUT_OF_STOCK" && <span className="badge badge-red">tükendi</span>}
                      {p.stockStatus === "LOW_STOCK" && <span className="badge badge-yellow">az</span>}
                    </td>
                    <td>
                      {p.isActive ? (
                        <span className="badge badge-green">Aktif</span>
                      ) : (
                        <span className="badge badge-red">Pasif</span>
                      )}
                    </td>
                    <td>
                      <a href={`/admin/products/${p.id}`} className="admin-btn secondary">
                        Düzenle
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
