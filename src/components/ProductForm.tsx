"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_UNITS, PRODUCT_UNIT_LABELS, type ProductUnit } from "@/lib/enums";

interface Category {
  id: string;
  title: string;
}

interface Props {
  productId?: string; // varsa "düzenle" modu
}

export function ProductForm({ productId }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    price: "",
    compareAtPrice: "",
    stock: "0",
    unit: "ADET" as ProductUnit,
    shortDescription: "",
    description: "",
    isActive: true,
    isFeatured: false,
  });
  const [loading, setLoading] = useState(!!productId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
  }, []);

  useEffect(() => {
    if (!productId) return;
    fetch(`/api/admin/products/${productId}`)
      .then((r) => r.json())
      .then((p) => {
        setForm({
          name: p.name,
          categoryId: p.categoryId,
          price: String(p.price),
          compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : "",
          stock: String(p.inventory?.quantity ?? 0),
          unit: p.unit,
          shortDescription: p.shortDescription ?? "",
          description: p.description ?? "",
          isActive: p.isActive,
          isFeatured: p.isFeatured,
        });
        setLoading(false);
      });
  }, [productId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      categoryId: form.categoryId,
      price: Number(form.price),
      compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
      stock: Number(form.stock),
      unit: form.unit,
      shortDescription: form.shortDescription || null,
      description: form.description || null,
      isActive: form.isActive,
      isFeatured: form.isFeatured,
    };

    const res = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
      method: productId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Kaydedilemedi. Alanları kontrol edin.");
      return;
    }
    router.push("/admin/products");
    router.refresh();
  }

  if (loading) return <p>Yükleniyor…</p>;

  return (
    <form className="admin-card" onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
      <h2 style={{ marginBottom: 16, fontFamily: "var(--font-heading)" }}>
        {productId ? "Ürünü Düzenle" : "Yeni Ürün"}
      </h2>

      <div className="form-row">
        <label>Ürün Adı *</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>

      <div className="form-row">
        <label>Kategori *</label>
        <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
          <option value="">Seçin…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div className="form-row" style={{ flex: 1 }}>
          <label>Fiyat (TL) *</label>
          <input required type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div className="form-row" style={{ flex: 1 }}>
          <label>Eski Fiyat (opsiyonel)</label>
          <input type="number" step="0.01" min="0" value={form.compareAtPrice} onChange={(e) => setForm({ ...form, compareAtPrice: e.target.value })} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div className="form-row" style={{ flex: 1 }}>
          <label>Birim</label>
          <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}>
            {PRODUCT_UNITS.map((u) => (
              <option key={u} value={u}>
                {PRODUCT_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ flex: 1 }}>
          <label>Stok</label>
          <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} disabled={!!productId} />
          {productId && <small style={{ color: "#757575" }}>Stok değişimi için "Stok" ekranını kullanın.</small>}
        </div>
      </div>

      <div className="form-row">
        <label>Kısa Açıklama</label>
        <input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} />
      </div>

      <div className="form-row">
        <label>Açıklama</label>
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Aktif (sitede görünür)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
          <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
          Öne çıkan
        </label>
      </div>

      {error && <p style={{ color: "#c0392b", marginBottom: 12 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="admin-btn" disabled={saving}>
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <a href="/admin/products" className="admin-btn secondary">
          İptal
        </a>
      </div>
    </form>
  );
}
