"use client";

import { useState, useMemo, useEffect } from "react";
import { parseCsv } from "@/lib/csv";
import { IMPORT_TARGET_FIELDS, IMPORT_FIELD_LABELS, REQUIRED_IMPORT_FIELDS, guessColumnMapping, type ImportTargetField } from "@/lib/import-products";

interface Category {
  id: string;
  title: string;
}
interface Brand {
  id: string;
  name: string;
}
interface PreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  warnings: string[];
  action: "CREATE" | "UPDATE" | "SKIP";
  runtimeError?: string;
}
interface PreviewSummary {
  totalRows: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  warningCount: number;
}
interface CommitSummary extends PreviewSummary {
  successCount: number;
  createdCount: number;
  updatedCount: number;
}

// Bölüm 23/24/26 — CSV İçe/Dışa Aktarma admin ekranı.
// AKIŞ (Bölüm 24'ün açık talebi): dosya seç → analiz (başlık algıla) →
// sütun eşleştirme → önizleme → doğrulama/hata raporu → onay → içe aktar.
// Önizleme ile gerçek içe aktarma AYNI backend doğrulama fonksiyonunu
// kullanır (src/lib/import-products.ts) — burada gösterilen sonuçla
// commit'te gerçekleşen ASLA farklılaşmaz.
export default function AdminImportExportPage() {
  // --- Dışa aktarma ---
  const [exportSearch, setExportSearch] = useState("");
  const [exportCategoryId, setExportCategoryId] = useState("");
  const [exportBrandId, setExportBrandId] = useState("");
  const [exportActive, setExportActive] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
    fetch("/api/admin/brands")
      .then((r) => r.json())
      .then((d) => setBrands(d.items ?? []));
  }, []);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (exportSearch) params.set("search", exportSearch);
    if (exportCategoryId) params.set("categoryId", exportCategoryId);
    if (exportBrandId) params.set("brandId", exportBrandId);
    if (exportActive) params.set("active", exportActive);
    return `/api/admin/products/export?${params.toString()}`;
  }, [exportSearch, exportCategoryId, exportBrandId, exportActive]);

  // --- İçe aktarma ---
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null);
  const [commitRows, setCommitRows] = useState<PreviewRow[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function resetImportState() {
    setPreviewSummary(null);
    setPreviewRows(null);
    setCommitSummary(null);
    setCommitRows(null);
    setImportError(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    resetImportState();
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setImportError("Dosya boş görünüyor veya CSV olarak okunamadı.");
        return;
      }
      const hdrs = Object.keys(parsed[0]);
      setHeaders(hdrs);
      setRows(parsed);
      setMapping(guessColumnMapping(hdrs));
    };
    reader.readAsText(file, "utf-8");
  }

  function missingRequiredFields(): ImportTargetField[] {
    const mappedFields = new Set(Object.values(mapping));
    return REQUIRED_IMPORT_FIELDS.filter((f) => !mappedFields.has(f));
  }

  async function runPreview() {
    setPreviewBusy(true);
    setImportError(null);
    setCommitSummary(null);
    setCommitRows(null);
    const res = await fetch("/api/admin/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, columnMapping: mapping }),
    });
    setPreviewBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setImportError(data.message ?? "Önizleme başarısız");
      return;
    }
    setPreviewSummary(data.summary);
    setPreviewRows(data.rows);
  }

  async function runCommit() {
    if (!previewSummary) return;
    if (!confirm(`${previewSummary.createCount} yeni ürün oluşturulacak, ${previewSummary.updateCount} ürün güncellenecek. ${previewSummary.errorCount} satır hata nedeniyle atlanacak. Devam edilsin mi?`)) return;
    setCommitBusy(true);
    setImportError(null);
    const res = await fetch("/api/admin/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, columnMapping: mapping, fileName: fileName ?? undefined }),
    });
    setCommitBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setImportError(data.message ?? "İçe aktarma başarısız");
      return;
    }
    setCommitSummary(data.summary);
    setCommitRows(data.rows);
  }

  const nameHeader = useMemo(() => Object.entries(mapping).find(([, f]) => f === "name")?.[0], [mapping]);
  const skuHeader = useMemo(() => Object.entries(mapping).find(([, f]) => f === "sku")?.[0], [mapping]);

  const displayRows = commitRows ?? previewRows;
  const sortedDisplayRows = useMemo(() => {
    if (!displayRows) return [];
    const withErrors = displayRows.filter((r) => r.errors.length > 0 || r.runtimeError);
    const withWarnings = displayRows.filter((r) => r.errors.length === 0 && !r.runtimeError && r.warnings.length > 0);
    const rest = displayRows.filter((r) => r.errors.length === 0 && !r.runtimeError && r.warnings.length === 0);
    return [...withErrors, ...withWarnings, ...rest].slice(0, 300);
  }, [displayRows]);

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>CSV Dışa Aktarma</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--gray-600)", marginBottom: 10 }}>
          XLSX (Excel ikili formatı) bilinçli olarak desteklenmiyor — bkz. docs/import-export.md (bağımlılık
          güvenlik kararı). CSV dosyasını Excel/Google Sheets'te doğrudan açabilirsiniz.
        </p>
        <div className="filters-row">
          <input placeholder="Ürün / SKU ara…" value={exportSearch} onChange={(e) => setExportSearch(e.target.value)} />
          <select value={exportCategoryId} onChange={(e) => setExportCategoryId(e.target.value)}>
            <option value="">Tüm kategoriler</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select value={exportBrandId} onChange={(e) => setExportBrandId(e.target.value)}>
            <option value="">Tüm markalar</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select value={exportActive} onChange={(e) => setExportActive(e.target.value)}>
            <option value="">Tüm durumlar</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
          <a className="admin-btn" href={exportUrl}>
            CSV İndir
          </a>
        </div>
      </div>

      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>CSV İçe Aktarma</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--gray-600)", marginBottom: 10 }}>
          Akış: dosya seç → sütunları eşleştir → önizle (hiçbir şey kaydedilmez) → hataları kontrol et → onayla.
          Zorunlu alanlar: {REQUIRED_IMPORT_FIELDS.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}. Kategori/marka
          içe aktarma sırasında OTOMATİK oluşturulmaz — önce admin panelinden oluşturulmuş olmaları gerekir.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ marginBottom: 14 }} />

        {headers.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>
              Sütun Eşleştirme ({fileName}, {rows.length} satır)
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 600 }}>
              {headers.map((h) => (
                <div key={h} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ flex: 1, fontSize: "0.85rem" }}>{h}</span>
                  <select
                    value={mapping[h] ?? ""}
                    onChange={(e) => {
                      resetImportState();
                      setMapping({ ...mapping, [h]: e.target.value });
                    }}
                  >
                    <option value="">(eşleştirme yok)</option>
                    {IMPORT_TARGET_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {IMPORT_FIELD_LABELS[f]}
                        {REQUIRED_IMPORT_FIELDS.includes(f) ? " *" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {missingRequiredFields().length > 0 && (
              <p style={{ color: "#c0392b", fontSize: "0.85rem", marginTop: 8 }}>
                Eksik zorunlu alan eşleştirmesi: {missingRequiredFields().map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}
              </p>
            )}
            <button
              className="admin-btn secondary"
              style={{ marginTop: 10 }}
              disabled={previewBusy || missingRequiredFields().length > 0}
              onClick={runPreview}
            >
              {previewBusy ? "Önizleniyor…" : "Önizle"}
            </button>
          </div>
        )}

        {importError && <p style={{ color: "#c0392b", marginBottom: 10 }}>{importError}</p>}

        {previewSummary && !commitSummary && (
          <div style={{ marginBottom: 14 }}>
            <div className="stat-cards">
              <div className="stat-card">
                <div className="num">{previewSummary.totalRows}</div>
                <div className="label">Toplam Satır</div>
              </div>
              <div className="stat-card" style={{ borderLeftColor: "#2E7D32" }}>
                <div className="num">{previewSummary.createCount}</div>
                <div className="label">Yeni Oluşturulacak</div>
              </div>
              <div className="stat-card" style={{ borderLeftColor: "#664D03" }}>
                <div className="num">{previewSummary.updateCount}</div>
                <div className="label">Güncellenecek</div>
              </div>
              <div className="stat-card" style={{ borderLeftColor: "#842029" }}>
                <div className="num">{previewSummary.errorCount}</div>
                <div className="label">Hatalı (Atlanacak)</div>
              </div>
            </div>
            <button
              className="admin-btn"
              disabled={commitBusy || previewSummary.createCount + previewSummary.updateCount === 0}
              onClick={runCommit}
            >
              {commitBusy ? "İçe Aktarılıyor…" : `İçe Aktarmayı Onayla (${previewSummary.createCount + previewSummary.updateCount} satır)`}
            </button>
          </div>
        )}

        {commitSummary && (
          <div style={{ marginBottom: 14 }}>
            <div className="stat-cards">
              <div className="stat-card" style={{ borderLeftColor: "#2E7D32" }}>
                <div className="num">{commitSummary.createdCount}</div>
                <div className="label">Oluşturuldu</div>
              </div>
              <div className="stat-card" style={{ borderLeftColor: "#664D03" }}>
                <div className="num">{commitSummary.updatedCount}</div>
                <div className="label">Güncellendi</div>
              </div>
              <div className="stat-card" style={{ borderLeftColor: "#842029" }}>
                <div className="num">{commitSummary.errorCount}</div>
                <div className="label">Başarısız</div>
              </div>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--gray-600)" }}>
              İçe aktarma tamamlandı ve audit log'a kaydedildi. Detaylı hata raporu aşağıdaki tabloda.
            </p>
          </div>
        )}

        {sortedDisplayRows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--gray-600)", marginBottom: 6 }}>
              {displayRows && displayRows.length > 300 ? `İlk 300 satır gösteriliyor (toplam ${displayRows.length}), hatalı satırlar önce listelenir.` : "Hatalı satırlar önce listelenir."}
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Satır</th>
                  <th>İşlem</th>
                  <th>Ürün Adı</th>
                  <th>SKU</th>
                  <th>Hatalar</th>
                  <th>Uyarılar</th>
                </tr>
              </thead>
              <tbody>
                {sortedDisplayRows.map((r) => (
                  <tr key={r.rowNumber} className={r.errors.length > 0 || r.runtimeError ? "unverified-row" : undefined}>
                    <td>{r.rowNumber}</td>
                    <td>
                      {r.action === "CREATE" && <span className="badge badge-green">Yeni</span>}
                      {r.action === "UPDATE" && <span className="badge badge-yellow">Güncelle</span>}
                      {r.action === "SKIP" && <span className="badge badge-red">Atlandı</span>}
                    </td>
                    <td>{nameHeader ? r.raw[nameHeader] : ""}</td>
                    <td>{skuHeader ? r.raw[skuHeader] : ""}</td>
                    <td style={{ color: "#842029", fontSize: "0.8rem" }}>
                      {r.errors.join("; ")}
                      {r.runtimeError ? ` (DB hatası: ${r.runtimeError})` : ""}
                    </td>
                    <td style={{ color: "#664D03", fontSize: "0.8rem" }}>{r.warnings.join("; ")}</td>
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
