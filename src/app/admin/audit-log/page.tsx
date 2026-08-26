"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  id: string;
  admin: { email: string; name: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export default function AdminAuditLogPage() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "100" });
    if (entity) params.set("entity", entity);
    fetch(`/api/admin/audit-log?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }, [entity]);

  return (
    <div className="admin-container">
      <div className="admin-card">
        <div className="filters-row">
          <select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Tüm kayıtlar</option>
            <option value="Auth">Auth</option>
            <option value="Product">Product</option>
            <option value="Campaign">Campaign</option>
            <option value="Banner">Banner</option>
            <option value="Inventory">Inventory</option>
            <option value="Category">Category</option>
            <option value="Settings">Settings</option>
            <option value="Migration">Migration</option>
          </select>
        </div>
        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Kullanıcı</th>
                  <th>İşlem</th>
                  <th>Varlık</th>
                  <th>IP</th>
                  <th>Detay</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.createdAt).toLocaleString("tr-TR")}</td>
                    <td>{l.admin?.email ?? "—"}</td>
                    <td>{l.action}</td>
                    <td>
                      {l.entity}
                      {l.entityId ? ` (${l.entityId.slice(0, 10)}…)` : ""}
                    </td>
                    <td>{l.ipAddress ?? "—"}</td>
                    <td style={{ maxWidth: 320, fontSize: "0.75rem", color: "#757575" }}>
                      {l.metadata ? JSON.stringify(l.metadata).slice(0, 140) : ""}
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
