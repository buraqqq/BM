"use client";

import { useEffect, useState } from "react";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/enums";

interface OrderRow {
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentStatusLabel: string;
  deliveryMethodLabel: string;
  total: number;
  createdAt: string;
  customer: { name: string | null; surname: string | null; email: string; phone: string | null };
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// FAZ 4C — Bölüm L: /admin/orders. Sipariş listesi + durum filtresi +
// sipariş numarası arama + pagination.
export default function AdminOrdersPage() {
  const [items, setItems] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  function load(p: number, s: string, q: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    if (q) params.set("orderNumber", q);
    params.set("page", String(p));
    params.set("pageSize", "20");
    fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setItems(d.items);
        setTotalPages(d.totalPages);
        setTotal(d.total);
        setPage(d.page);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1, "", "");
  }, []);

  function applyFilters() {
    load(1, status, search.trim());
  }

  return (
    <div className="admin-container">
      <h2>Siparişler</h2>

      <div className="filters-row" style={{ marginBottom: 14 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tüm Durumlar</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s as OrderStatus]}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sipariş no ara (örn. BM-)"
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        />
        <button className="admin-btn" onClick={applyFilters} type="button">
          Filtrele
        </button>
      </div>

      <p className="label">Toplam {total} sipariş</p>

      {loading ? (
        <p className="label">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="label">Sipariş bulunamadı.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Sipariş No</th>
              <th>Müşteri</th>
              <th>Tarih</th>
              <th>Durum</th>
              <th>Ödeme</th>
              <th>Teslimat</th>
              <th>Toplam</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.orderNumber}>
                <td>
                  <a href={`/admin/orders/${o.orderNumber}`} style={{ fontWeight: 700 }}>
                    {o.orderNumber}
                  </a>
                </td>
                <td>
                  {o.customer.name || o.customer.surname
                    ? `${o.customer.name ?? ""} ${o.customer.surname ?? ""}`.trim()
                    : o.customer.email}
                </td>
                <td>{formatDate(o.createdAt)}</td>
                <td>
                  <span className="badge badge-gray">{o.statusLabel}</span>
                </td>
                <td>{o.paymentStatusLabel}</td>
                <td>{o.deliveryMethodLabel}</td>
                <td>{formatTL(o.total)} ₺</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className="admin-btn secondary"
              style={{ padding: "6px 12px" }}
              onClick={() => load(p, status, search.trim())}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
