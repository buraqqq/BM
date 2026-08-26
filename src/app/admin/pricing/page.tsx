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
interface Brand {
  id: string;
  name: string;
}

type Scope = "ALL" | "CATEGORY" | "BRAND" | "SELECTED" | "FILTERED";
type OperationType = "PERCENT_INCREASE" | "PERCENT_DECREASE" | "FIXED_INCREASE" | "FIXED_DECREASE" | "SET_PRICE";

const OPERATION_LABELS: Record<OperationType, string> = {
  PERCENT_INCREASE: "Yüzde Artış (+%)",
  PERCENT_DECREASE: "Yüzde İndirim (-%)",
  FIXED_INCREASE: "Sabit Artış (+TL)",
  FIXED_DECREASE: "Sabit İndirim (-TL)",
  SET_PRICE: "Belirli Fiyata Sabitle (=TL)",
};

// Bölüm 13/14/15/16 — Toplu Fiyat Motoru admin UI'ı: kapsam × işlem
// matrisinin TAMAMINI kapsar (tümü / kategori / marka / seçili ürünler /
// filtrelenmiş ürünler) × (+%/-%/​+TL/-TL/belirli fiyata sabitle).
// ÖNİZLEME HER ZAMAN ZORUNLUDUR: "Uygula" butonu yalnızca en son girilen
// kapsam+işlem ile alınmış bir önizleme varsa aktif olur; kapsam veya işlem
// değiştirildiğinde önizleme sıfırlanır ki eski önizlemeyle farklı bir
// kapsam yanlışlıkla uygulanamasın.
export default function AdminPricingPage() {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // --- Toplu revizyon kapsamı ---
  const [scope, setScope] = useState<Scope>("CATEGORY");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkBrandId, setBulkBrandId] = useState("");

  // SELECTED kapsamı: arama + çoklu seçim + temizle
  const [selectSearch, setSelectSearch] = useState("");
  const [selectResults, setSelectResults] = useState<AdminProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<AdminProduct[]>([]);

  // FILTERED kapsamı: mevcut filtre kriterleriyle ürünleri getir, o anki
  // id listesini dondur (önizleme ile uygulama arasında liste değişmesin diye)
  const [filterSearch, setFilterSearch] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterBrandId, setFilterBrandId] = useState("");
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [filterBusy, setFilterBusy] = useState(false);

  const [bulkType, setBulkType] = useState<OperationType>("PERCENT_INCREASE");
  const [bulkValue, setBulkValue] = useState("10");
  const [bulkPreview, setBulkPreview] = useState<{
    affectedCount: number;
    preview: { name: string; oldPrice: number; newPrice: number }[];
  } | null>(null);
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
    fetch("/api/admin/brands")
      .then((r) => r.json())
      .then((d) => setBrands(d.items ?? []));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Kapsam veya işlem değişirse eski önizleme artık geçersizdir — sıfırla.
  useEffect(() => {
    setBulkPreview(null);
  }, [scope, bulkCategoryId, bulkBrandId, selectedProducts, filteredIds, bulkType, bulkValue]);

  useEffect(() => {
    if (!selectSearch.trim()) {
      setSelectResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/products?search=${encodeURIComponent(selectSearch)}&pageSize=20`)
        .then((r) => r.json())
        .then((d) => setSelectResults(d.items ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [selectSearch]);

  function toggleSelectProduct(p: AdminProduct) {
    setSelectedProducts((prev) =>
      prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]
    );
  }

  // API pageSize'ı 200 ile sınırlı (bkz. /api/admin/products) — büyük
  // katalog hedefinde (10.000+) tek istekte "tümü" alınamayacağı için burada
  // sayfa sayfa gezip TÜM eşleşen id'leri topluyoruz; ekranda gösterilen
  // sayı ile dondurulan liste böylece her zaman birebir aynı olur.
  async function resolveFilteredIds() {
    setFilterBusy(true);
    const ids: string[] = [];
    let page = 1;
    let total = 0;
    const PAGE_SIZE = 200;
    for (;;) {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (filterSearch) params.set("search", filterSearch);
      if (filterCategoryId) params.set("categoryId", filterCategoryId);
      if (filterBrandId) params.set("brandId", filterBrandId);
      const res = await fetch(`/api/admin/products?${params}`);
      const data = await res.json();
      total = data.total ?? 0;
      ids.push(...(data.items ?? []).map((p: AdminProduct) => p.id));
      if (ids.length >= total || (data.items?.length ?? 0) === 0) break;
      page += 1;
    }
    setFilterBusy(false);
    setFilteredIds(ids);
    setFilteredCount(total);
  }

  function scopePayload(): Record<string, unknown> | null {
    if (scope === "ALL") return { allProducts: true };
    if (scope === "CATEGORY") return bulkCategoryId ? { categoryId: bulkCategoryId } : null;
    if (scope === "BRAND") return bulkBrandId ? { brandId: bulkBrandId } : null;
    if (scope === "SELECTED") return selectedProducts.length > 0 ? { productIds: selectedProducts.map((p) => p.id) } : null;
    if (scope === "FILTERED") return filteredIds && filteredIds.length > 0 ? { productIds: filteredIds } : null;
    return null;
  }

  const scopeReady = scopePayload() !== null;

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
    const payload = scopePayload();
    if (!payload) return;
    setBulkBusy(true);
    const res = await fetch("/api/admin/products/bulk-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, adjustment: { type: bulkType, value: Number(bulkValue) }, dryRun: true }),
    });
    setBulkBusy(false);
    const data = await res.json();
    if (res.ok) setBulkPreview(data);
    else alert(data.message ?? "Önizleme başarısız");
  }

  async function applyBulk() {
    const payload = scopePayload();
    if (!payload || !bulkPreview) return;
    if (!confirm(`${bulkPreview.affectedCount} ürünün fiyatı güncellensin mi? Bu işlem geri alınamaz (ancak fiyat geçmişinde kayıt altına alınır).`)) return;
    setBulkBusy(true);
    const res = await fetch("/api/admin/products/bulk-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, adjustment: { type: bulkType, value: Number(bulkValue) }, dryRun: false }),
    });
    setBulkBusy(false);
    if (res.ok) {
      setBulkPreview(null);
      setFilteredIds(null);
      setFilteredCount(null);
      setSelectedProducts([]);
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
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Toplu Fiyat Revizyonu (Bölüm 13-16)</h2>

        <div className="form-row">
          <label>Kapsam</label>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="ALL">Tüm Ürünler</option>
            <option value="CATEGORY">Kategori (+ alt kategoriler)</option>
            <option value="BRAND">Marka</option>
            <option value="SELECTED">Seçili Ürünler</option>
            <option value="FILTERED">Filtrelenmiş Ürünler</option>
          </select>
        </div>

        {scope === "ALL" && (
          <p style={{ fontSize: "0.85rem", color: "#842029", marginBottom: 10 }}>
            ⚠ Bu kapsam AKTİF/PASİF fark etmeksizin sistemdeki tüm ürünleri etkiler. Önizlemeyi dikkatle kontrol edin.
          </p>
        )}

        {scope === "CATEGORY" && (
          <div className="filters-row">
            <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
              <option value="">Kategori seçin…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {scope === "BRAND" && (
          <div className="filters-row">
            <select value={bulkBrandId} onChange={(e) => setBulkBrandId(e.target.value)}>
              <option value="">Marka seçin…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {scope === "SELECTED" && (
          <div style={{ marginBottom: 14 }}>
            <div className="filters-row">
              <input
                placeholder="Ürün / SKU ara ve listeden ekleyin…"
                value={selectSearch}
                onChange={(e) => setSelectSearch(e.target.value)}
              />
              {selectedProducts.length > 0 && (
                <button className="admin-btn secondary" onClick={() => setSelectedProducts([])}>
                  Seçimi Temizle ({selectedProducts.length})
                </button>
              )}
            </div>
            {selectResults.length > 0 && (
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--gray-200)", borderRadius: 8, marginBottom: 10 }}>
                {selectResults.map((p) => (
                  <label key={p.id} style={{ display: "flex", gap: 8, padding: "6px 10px", alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedProducts.some((x) => x.id === p.id)} onChange={() => toggleSelectProduct(p)} />
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <span style={{ color: "var(--gray-600)", fontSize: "0.8rem" }}>{p.sku} · {p.price} TL</span>
                  </label>
                ))}
              </div>
            )}
            {selectedProducts.length > 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--gray-800)" }}>
                Seçili: {selectedProducts.map((p) => p.name).join(", ")}
              </p>
            )}
          </div>
        )}

        {scope === "FILTERED" && (
          <div style={{ marginBottom: 14 }}>
            <div className="filters-row">
              <input placeholder="Ürün / SKU ara…" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
              <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)}>
                <option value="">Tüm kategoriler</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <select value={filterBrandId} onChange={(e) => setFilterBrandId(e.target.value)}>
                <option value="">Tüm markalar</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button className="admin-btn secondary" onClick={resolveFilteredIds} disabled={filterBusy}>
                Ürünleri Getir
              </button>
            </div>
            {filteredCount !== null && (
              <p style={{ fontSize: "0.85rem", color: "var(--gray-800)" }}>
                Filtreye uyan <strong>{filteredCount}</strong> ürün bulundu ve bu liste dondu — önizleme ve uygulama
                bu sabit listeyi kullanacak.
              </p>
            )}
          </div>
        )}

        <div className="filters-row">
          <select value={bulkType} onChange={(e) => setBulkType(e.target.value as OperationType)}>
            {(Object.keys(OPERATION_LABELS) as OperationType[]).map((t) => (
              <option key={t} value={t}>
                {OPERATION_LABELS[t]}
              </option>
            ))}
          </select>
          <input type="number" min="0" step="0.01" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={{ width: 120 }} />
          <span style={{ fontSize: "0.8rem", color: "var(--gray-600)" }}>
            {bulkType === "SET_PRICE" ? "hedef fiyat (TL)" : bulkType.startsWith("PERCENT") ? "%" : "TL"}
          </span>
          <button className="admin-btn secondary" onClick={runBulkPreview} disabled={!scopeReady || bulkBusy}>
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
                  <th>Fark</th>
                </tr>
              </thead>
              <tbody>
                {bulkPreview.preview.map((p, i) => {
                  const diff = p.newPrice - p.oldPrice;
                  return (
                    <tr key={i}>
                      <td>{p.name}</td>
                      <td>{p.oldPrice} TL</td>
                      <td>{p.newPrice} TL</td>
                      <td className={diff > 0 ? "count-diff-pos" : diff < 0 ? "count-diff-neg" : "count-diff-zero"}>
                        {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} TL
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="admin-btn" style={{ marginTop: 12 }} onClick={applyBulk} disabled={bulkBusy}>
              Uygula ({bulkPreview.affectedCount} ürün)
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
