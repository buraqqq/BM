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
interface Brand {
  id: string;
  name: string;
}
interface CampaignOption {
  id: string;
  name: string;
}

type BulkAction =
  | "ACTIVATE"
  | "DEACTIVATE"
  | "ARCHIVE"
  | "SET_CATEGORY"
  | "SET_BRAND"
  | "SET_FEATURED"
  | "UNSET_FEATURED"
  | "ADD_TO_CAMPAIGN"
  | "REMOVE_FROM_CAMPAIGN";

const BULK_ACTION_LABELS: Record<BulkAction, string> = {
  ACTIVATE: "Aktif Yap",
  DEACTIVATE: "Pasif Yap",
  ARCHIVE: "Arşivle",
  SET_CATEGORY: "Kategori Değiştir",
  SET_BRAND: "Marka Değiştir",
  SET_FEATURED: "Öne Çıkar",
  UNSET_FEATURED: "Öne Çıkarmayı Kaldır",
  ADD_TO_CAMPAIGN: "Kampanyaya Ekle",
  REMOVE_FROM_CAMPAIGN: "Kampanyadan Çıkar",
};

export default function AdminProductsPage() {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [active, setActive] = useState("");
  const [stock, setStock] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Bölüm 35/37 — server-side pagination (10.000+ ürün hedefinde admin
  // listesi ASLA "tümünü getir" yapmaz). Filtre değişince sayfa 1'e döner.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);

  // Bölüm 22 — toplu işlem paneli
  const [bulkAction, setBulkAction] = useState<BulkAction>("ACTIVATE");
  const [bulkTargetCategoryId, setBulkTargetCategoryId] = useState("");
  const [bulkTargetBrandId, setBulkTargetBrandId] = useState("");
  const [bulkTargetCampaignId, setBulkTargetCampaignId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryId) params.set("categoryId", categoryId);
    if (active) params.set("active", active);
    if (stock) params.set("stock", stock);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await fetch(`/api/admin/products?${params.toString()}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setTotalPages(data.totalPages ?? 1);
    setLoading(false);
  }, [search, categoryId, active, stock, page, pageSize]);

  // Filtre veya sayfa boyutu değişince 1. sayfaya dön (aksi halde ör. 50
  // sonuçlu bir aramadan sonra hâlâ sayfa 5'te kalıp boş liste görünebilir).
  useEffect(() => {
    setPage(1);
  }, [search, categoryId, active, stock, pageSize]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
    fetch("/api/admin/brands")
      .then((r) => r.json())
      .then((d) => setBrands(d.items ?? []));
    fetch("/api/admin/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns((d.items ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))));
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

  function bulkActionNeedsTarget(a: BulkAction) {
    return a === "SET_CATEGORY" || a === "SET_BRAND" || a === "ADD_TO_CAMPAIGN" || a === "REMOVE_FROM_CAMPAIGN";
  }

  function bulkActionReady() {
    if (selected.size === 0) return false;
    if (bulkAction === "SET_CATEGORY") return !!bulkTargetCategoryId;
    if (bulkAction === "SET_BRAND") return true; // boş bırakılırsa marka kaldırılır (null)
    if (bulkAction === "ADD_TO_CAMPAIGN" || bulkAction === "REMOVE_FROM_CAMPAIGN") return !!bulkTargetCampaignId;
    return true;
  }

  // Bölüm 22/33/45 — tüm toplu ürün işlemleri TEK bir onaylı, transaction'lı,
  // audit log'lu uca (/api/admin/products/bulk-action) bağlanır; önceki
  // sürümdeki N adet ayrı PATCH isteği (Promise.all) yerine artık tek istek.
  async function runBulkAction() {
    if (!bulkActionReady()) return;
    const count = selected.size;
    const label = BULK_ACTION_LABELS[bulkAction];
    if (!confirm(`${count} ürün için "${label}" işlemi uygulansın mı?`)) return;

    setBulkBusy(true);
    const res = await fetch("/api/admin/products/bulk-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: [...selected],
        action: bulkAction,
        categoryId: bulkAction === "SET_CATEGORY" ? bulkTargetCategoryId : undefined,
        brandId: bulkAction === "SET_BRAND" ? bulkTargetBrandId || null : undefined,
        campaignId: bulkActionNeedsTarget(bulkAction) && (bulkAction === "ADD_TO_CAMPAIGN" || bulkAction === "REMOVE_FROM_CAMPAIGN") ? bulkTargetCampaignId : undefined,
      }),
    });
    setBulkBusy(false);
    if (res.ok) {
      const data = await res.json();
      setSelected(new Set());
      setMsg(`"${label}" işlemi ${data.affectedCount} üründe uygulandı.`);
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "Toplu işlem başarısız");
    }
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
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={20}>20 / sayfa</option>
            <option value={50}>50 / sayfa</option>
            <option value={100}>100 / sayfa</option>
          </select>
          <a href="/admin/products/new" className="admin-btn">
            + Yeni Ürün
          </a>
        </div>

        {totalPages > 1 && (
          <div className="filters-row" style={{ justifyContent: "flex-end" }}>
            <button className="admin-btn secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ← Önceki
            </button>
            <span style={{ fontSize: "0.85rem" }}>
              Sayfa {page} / {totalPages}
            </span>
            <button className="admin-btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Sonraki →
            </button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="count-mode-box" style={{ marginBottom: 16 }}>
            <span>
              <strong>{selected.size}</strong> ürün seçili
            </span>
            <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value as BulkAction)}>
              {(Object.keys(BULK_ACTION_LABELS) as BulkAction[]).map((a) => (
                <option key={a} value={a}>
                  {BULK_ACTION_LABELS[a]}
                </option>
              ))}
            </select>

            {bulkAction === "SET_CATEGORY" && (
              <select value={bulkTargetCategoryId} onChange={(e) => setBulkTargetCategoryId(e.target.value)}>
                <option value="">Kategori seçin…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}

            {bulkAction === "SET_BRAND" && (
              <select value={bulkTargetBrandId} onChange={(e) => setBulkTargetBrandId(e.target.value)}>
                <option value="">(Markayı kaldır)</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            {(bulkAction === "ADD_TO_CAMPAIGN" || bulkAction === "REMOVE_FROM_CAMPAIGN") && (
              <select value={bulkTargetCampaignId} onChange={(e) => setBulkTargetCampaignId(e.target.value)}>
                <option value="">Kampanya seçin…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <button className="admin-btn" disabled={!bulkActionReady() || bulkBusy} onClick={runBulkAction}>
              Uygula
            </button>
            <button className="admin-btn secondary" onClick={() => setSelected(new Set())}>
              Seçimi Temizle
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

        {totalPages > 1 && (
          <div className="filters-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="admin-btn secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ← Önceki
            </button>
            <span style={{ fontSize: "0.85rem" }}>
              Sayfa {page} / {totalPages} ({total} ürün)
            </span>
            <button className="admin-btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Sonraki →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
