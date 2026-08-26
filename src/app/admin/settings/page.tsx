"use client";

import { useEffect, useState } from "react";

interface Setting {
  id: string;
  key: string;
  value: string;
}

export default function AdminSettingsPage() {
  const [items, setItems] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }, []);

  function update(key: string, value: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, value } : i)));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: items.map((i) => ({ key: i.key, value: i.value })) }),
    });
    setSaving(false);
    setMsg(res.ok ? "Kaydedildi. Public site bir sonraki istekte güncel değerleri gösterecek." : "Kaydedilemedi.");
  }

  return (
    <div className="admin-container">
      <div className="admin-card" style={{ maxWidth: 700 }}>
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Site Ayarları (Bize Ulaşın vb.)</h2>
        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <>
            {items.map((s) => (
              <div className="form-row" key={s.key}>
                <label>{s.key}</label>
                <input value={s.value} onChange={(e) => update(s.key, e.target.value)} />
              </div>
            ))}
            {msg && <p style={{ color: "#2E7D32", marginBottom: 10 }}>{msg}</p>}
            <button className="admin-btn" onClick={save} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
