"use client";

import { useMemo, useRef, useState } from "react";
import type { Zone, SpaceInput, DesignResult, ZoneId } from "@/lib/ai-designer-logic";
import { ZONE_LABELS, ZONE_IDS } from "@/lib/ai-designer-logic";
import { generateMockVisualLayout } from "@/lib/ai-designer-inputs";

const ZONE_COLORS: Record<ZoneId, string> = {
  PLANTS: "#3f7d3a",
  SEEDS: "#8bc34a",
  IRRIGATION: "#2196f3",
  ACCESSORIES: "#e65100",
};

/** Numaralı bölge etiketi (kullanıcı "Zone C"yi bu numarayla hedefler). */
const ZONE_NUMBER_LABELS: Record<ZoneId, string> = {
  PLANTS: "Zone A",
  SEEDS: "Zone B",
  IRRIGATION: "Zone C",
  ACCESSORIES: "Zone D",
};

const ZONE_SHORT_LABELS: Record<ZoneId, string> = {
  PLANTS: "Bitkiler",
  SEEDS: "Tohum & Çim",
  IRRIGATION: "Sulama",
  ACCESSORIES: "Aksesuar",
};

// ==========================================================
// FAZ 12 — Puzzle editörü + nokta revize.
//
// Kullanıcı tasarımı NUMARALI bölgeler (Zone A/B/C/D) üzerinden düzenler:
//   - Sıra değiştirme (sürükle & bırak + ▲▼) ve alan yüzdesi (slider).
//   - "Nokta Revize": tüm tasarımı baştan yapmadan TEK bir numaralı bölgeyi
//     hedefler; istek metnini AI'ya (LLM, fallback deterministik) iletir.
//   - "Maliyeti Güncelle": düzenlenmiş yüzdelerle BOM + maliyeti yeniden hesaplar.
//   - "Tasarımı Kaydet": düzenlenmiş yerleşimi PNG olarak cihaza indirir.
// ==========================================================
export function GardenPuzzleEditor({
  zones,
  input,
  onRecalculated,
}: {
  zones: Zone[];
  input: SpaceInput;
  onRecalculated: (data: { result: DesignResult; visual: string }) => void;
}) {
  const [layout, setLayout] = useState<Zone[]>(() => zones.map((z) => ({ ...z })));
  const [recalcing, setRecalcing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reviseZone, setReviseZone] = useState<ZoneId>("PLANTS");
  const [reviseInstruction, setReviseInstruction] = useState("");
  const [revising, setRevising] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const visual = useMemo(() => generateMockVisualLayout(layout), [layout]);

  function move(from: number, to: number) {
    setLayout((prev) => {
      if (to < 0 || to >= prev.length || from < 0 || from >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function setPercent(index: number, value: number) {
    setLayout((prev) => prev.map((z, i) => (i === index ? { ...z, areaPercent: value } : z)));
  }

  function applyResult(data: { result: DesignResult; visual: string }) {
    setLayout(data.result.zones.map((z) => ({ ...z })));
    onRecalculated(data);
  }

  async function recalculate() {
    setRecalcing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ai-designer/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          zones: layout.map((z) => ({ id: z.id, areaPercent: z.areaPercent })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.result) {
        setMsg("Maliyet güncellenemedi.");
        return;
      }
      applyResult(data);
      setMsg("Maliyet ve ürün listesi güncellendi.");
    } catch {
      setMsg("Sunucuya ulaşılamadı.");
    } finally {
      setRecalcing(false);
    }
  }

  async function reviseTargetZone() {
    if (!reviseInstruction.trim()) {
      setMsg("Revize isteğinizi yazın (ör. \"Zone C'yi büyüt\" veya \"sulamayı azalt\").");
      return;
    }
    setRevising(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ai-designer/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          currentZones: layout.map((z) => ({ id: z.id, areaPercent: z.areaPercent })),
          targetZone: reviseZone,
          instruction: reviseInstruction.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.result) {
        setMsg("Revize tamamlanamadı.");
        return;
      }
      applyResult(data);
      setReviseInstruction("");
      setMsg(`${ZONE_NUMBER_LABELS[reviseZone]} revize edildi.`);
    } catch {
      setMsg("Sunucuya ulaşılamadı.");
    } finally {
      setRevising(false);
    }
  }

  async function saveToDevice() {
    setSaving(true);
    setMsg(null);
    try {
      const png = await svgToPng(visual, 800, 600);

      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
        const blob = await (await fetch(png)).blob();
        const file = new File([blob], "bahce-tasarimi.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Bahçe Tasarımım" });
          setMsg("Tasarım paylaşıldı / kaydedildi.");
          return;
        }
      }

      const a = document.createElement("a");
      a.href = png;
      a.download = "bahce-tasarimi.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMsg("Tasarım cihazınıza PNG olarak kaydedildi.");
    } catch {
      setMsg("Tasarım kaydedilemedi; tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="account-card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0 }}>Puzzle Düzenleme — Tasarımını Düzenle</h3>
      <p className="account-sub" style={{ marginTop: 4 }}>
        Numaralı bölgeleri (Zone A/B/C/D) sürükleyerek veya oklarla yeniden sırala; alanını slider ile ayarla. Tek bir bölgeyi beğenmediysen aşağıdan yalnızca o bölgeyi revize et.
      </p>

      {/* Canlı önizleme — SVG'yi ham HTML olarak DOM'a enjekte etmek yerine (dangerouslySetInnerHTML,
          docs/security.md'deki "kod tabanında 0 dangerouslySetInnerHTML" ilkesine aykırıydı) <img>
          src'ine gömülü bir data URI olarak veriyoruz. Tarayıcı bunu bir görüntü olarak parse eder —
          DOM'a script çalıştırabilecek biçimde asla enjekte edilmez (savunma derinliği: zone.title/
          description ileride bu SVG'ye eklenirse, ya da LLM çıktısı manipüle edilirse bile XSS yüzeyi
          açılmaz). */}
      <div style={{ margin: "14px 0", borderRadius: 12, overflow: "hidden", border: "1px solid var(--gray-200)" }}>
        <img src={svgToDataUri(visual)} alt="Bahçe yerleşim önizlemesi" style={{ display: "block", width: "100%", height: "auto" }} />
      </div>

      {/* Puzzle blokları (numaralı) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {layout.map((z, i) => (
          <div
            key={z.id}
            draggable
            onDragStart={() => { dragIndex.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex.current !== null) move(dragIndex.current, i); dragIndex.current = null; }}
            style={{ border: `2px solid ${ZONE_COLORS[z.id]}`, borderRadius: 10, padding: 10, background: "#fff" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button type="button" className="btn btn-white" style={{ padding: "2px 8px", fontSize: "0.7rem" }} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Yukarı taşı">▲</button>
                <button type="button" className="btn btn-white" style={{ padding: "2px 8px", fontSize: "0.7rem" }} onClick={() => move(i, i + 1)} disabled={i === layout.length - 1} aria-label="Aşağı taşı">▼</button>
              </div>
              <span className="badge" style={{ background: ZONE_COLORS[z.id], color: "#fff", minWidth: 74, textAlign: "center", fontWeight: 700 }}>{ZONE_NUMBER_LABELS[z.id]}</span>
              <span className="account-sub" style={{ margin: 0, fontWeight: 600 }}>{ZONE_SHORT_LABELS[z.id]}</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="account-sub" style={{ margin: 0 }}>{ZONE_LABELS[z.id]}</span>
                  <span className="account-sub" style={{ margin: 0, fontWeight: 600 }}>%{z.areaPercent}</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={z.areaPercent} onChange={(e) => setPercent(i, Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Nokta revize — numaralı tek bölgeyi hedefle */}
      <div className="account-card" style={{ marginTop: 14, padding: 14 }}>
        <div className="label" style={{ marginBottom: 6 }}>Nokta Revize — Tek Bir Bölgeyi Değiştir</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={reviseZone} onChange={(e) => setReviseZone(e.target.value as ZoneId)} style={{ maxWidth: 140 }}>
            {ZONE_IDS.map((id) => (
              <option key={id} value={id}>{ZONE_NUMBER_LABELS[id]} — {ZONE_SHORT_LABELS[id]}</option>
            ))}
          </select>
          <input value={reviseInstruction} onChange={(e) => setReviseInstruction(e.target.value)} placeholder={"Ör. \"Zone C'yi büyüt\" veya \"sulamayı azalt\""} style={{ flex: 1, minWidth: 200 }} />
          <button type="button" className="btn btn-primary" onClick={reviseTargetZone} disabled={revising} style={{ justifyContent: "center" }}>
            <i className="fas fa-magic" /> {revising ? "Revize Ediliyor…" : "Bölgeyi Revize Et"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button type="button" className="btn btn-primary" onClick={recalculate} disabled={recalcing} style={{ justifyContent: "center" }}>
          <i className="fas fa-calculator" /> {recalcing ? "Güncelleniyor…" : "Maliyeti Güncelle"}
        </button>
        <button type="button" className="btn btn-primary" onClick={saveToDevice} disabled={saving} style={{ justifyContent: "center" }}>
          <i className="fas fa-download" /> {saving ? "Kaydediliyor…" : "Tasarımı Kaydet"}
        </button>
      </div>
      {msg && <p className="account-sub" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

/** SVG string → görüntü olarak güvenli biçimde gömülebilecek data URI (XSS'e kapalı; bkz. yukarıdaki yorum). */
function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** SVG string → canvas → PNG data URL. Boyut 2x (netlik için). */
function svgToPng(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas 2d context yok"));
        return;
      }
      ctx.fillStyle = "#14100d";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG rasterize edilemedi"));
    };
    img.src = url;
  });
}
