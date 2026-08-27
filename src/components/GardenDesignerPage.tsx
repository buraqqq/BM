"use client";

import { useRef, useState } from "react";
import { GardenPuzzleEditor } from "@/components/GardenPuzzleEditor";
import {
  SPACE_TYPES,
  SPACE_TYPE_LABELS,
  FACADES,
  LIGHTS,
  CLIMATES,
  USAGES,
  BUDGETS,
  type SpaceType,
  type Facade,
  type Light,
  type Climate,
  type Usage,
  type Budget,
  type DesignResult,
  type SpaceInput,
} from "@/lib/ai-designer-logic";

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

interface DesignResponse {
  source: "rule-based" | "llm";
  result: DesignResult;
  visual: string;
  input: SpaceInput;
}

// Web Speech API için minimal tip (lib.dom'da standart SpeechRecognition tipi yok).
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
}

const LIGHT_LABELS: Record<Light, string> = { TAM_GUNES: "Tam Güneş", YARI_GOLGE: "Yarı Gölge", GOLGE: "Gölge" };
const FACADE_LABELS: Record<Facade, string> = { KUZEY: "Kuzey", GUNEY: "Güney", DOGU: "Doğu", BATI: "Batı" };
const CLIMATE_LABELS: Record<Climate, string> = { EGE: "Ege / İzmir", AKDENIZ: "Akdeniz", KARASAL: "Karasal", KARADENIZ: "Karadeniz", GENEL: "Genel" };
const USAGE_LABELS: Record<Usage, string> = { LOUNGE: "Dinlenme / Lounge", HOBI: "Hobi / Bostan", ESTETIK: "Estetik / Süs", PET_COCUK: "Pet / Çocuk Dostu" };
const BUDGET_LABELS: Record<Budget, string> = { EKONOMIK: "Ekonomik", STANDART: "Standart", PREMIUM: "Premium" };

// ==========================================================
// FAZ 5 — /bahce-tasarimi: AI Garden Designer (Market + Studio deneyimi).
// Wizard + yazılı/sesli komut girişi → puzzle zoning + BOM + hibrit envanter/
// affiliate eşleştirmesi + maliyet kartı + mock görsel yerleşim.
// ==========================================================
export function GardenDesignerPage() {
  const [form, setForm] = useState({
    spaceType: "TERAS" as SpaceType,
    widthMeters: "4",
    depthMeters: "3",
    facade: "GUNEY" as Facade,
    light: "TAM_GUNES" as Light,
    climate: "EGE" as Climate,
    windExposed: false,
    usages: ["LOUNGE"] as Usage[],
    budget: "STANDART" as Budget,
    textCommand: "",
  });
  const [result, setResult] = useState<DesignResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartMsg, setCartMsg] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  function toggleUsage(u: Usage) {
    setForm((f) => ({ ...f, usages: f.usages.includes(u) ? f.usages.filter((x) => x !== u) : [...f.usages, u] }));
  }

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function clearPhoto() {
    setPhotoDataUrl(null);
  }

  function startVoice() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setVoiceError("Tarayıcınız sesli komutu desteklemiyor.");
      return;
    }
    const rec = new SR();
    rec.lang = "tr-TR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) setVoiceTranscript((t) => (t ? t + " " + transcript : transcript));
    };
    rec.onend = () => setVoiceListening(false);
    rec.onerror = () => {
      setVoiceListening(false);
      setVoiceError("Ses alınamadı; yazılı komutu kullanabilirsiniz.");
    };
    setVoiceError(null);
    setVoiceListening(true);
    rec.start();
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCartMsg(null);
    try {
      const res = await fetch("/api/ai-designer/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceType: form.spaceType,
          widthMeters: Number(form.widthMeters),
          depthMeters: Number(form.depthMeters),
          facade: form.facade,
          light: form.light,
          climate: form.climate,
          windExposed: form.windExposed,
          usages: form.usages,
          budget: form.budget,
          textCommand: form.textCommand.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error === "VALIDATION_ERROR" ? "Girdi doğrulanamadı." : "Tasarım oluşturulamadı.");
        return;
      }
      setResult(data);
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function addAllInternal() {
    if (!result) return;
    const internal = result.result.items.filter((i) => i.source === "internal");
    if (internal.length === 0) {
      setCartMsg("Bu tasarımda iç envanterden eşleşen ürün yok.");
      return;
    }
    let ok = 0;
    for (const item of internal) {
      if (!item.productId) continue;
      const r = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.productId, quantity: item.quantity }),
      });
      if (r.ok) ok++;
    }
    setCartMsg(`${ok} iç ürün sepete eklendi.`);
  }

  return (
    <div className="account-shell wide">
      <div className="account-card" style={{ marginBottom: 20 }}>
        <h2>AI Garden Designer — Bahçe Tasarımı</h2>
        <p className="account-sub">Alanınızı tanımlayın (veya sesli/yazılı komut verin); bölgeleme, ihtiyaç listesi ve ürün önerisi üretelim.</p>

        <div className="account-form" style={{ marginTop: 14 }}>
          <div className="account-form-row">
            <div>
              <label>Alan Tipi</label>
              <select value={form.spaceType} onChange={(e) => setForm({ ...form, spaceType: e.target.value as SpaceType })}>
                {SPACE_TYPES.map((s) => <option key={s} value={s}>{SPACE_TYPE_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label>Cephe</label>
              <select value={form.facade} onChange={(e) => setForm({ ...form, facade: e.target.value as Facade })}>
                {FACADES.map((f) => <option key={f} value={f}>{FACADE_LABELS[f]}</option>)}
              </select>
            </div>
          </div>

          <div className="account-form-row">
            <div>
              <label>Genişlik (m)</label>
              <input type="number" min={0.5} step={0.5} value={form.widthMeters} onChange={(e) => setForm({ ...form, widthMeters: e.target.value })} />
            </div>
            <div>
              <label>Derinlik (m)</label>
              <input type="number" min={0.5} step={0.5} value={form.depthMeters} onChange={(e) => setForm({ ...form, depthMeters: e.target.value })} />
            </div>
          </div>

          <div className="account-form-row">
            <div>
              <label>Işık</label>
              <select value={form.light} onChange={(e) => setForm({ ...form, light: e.target.value as Light })}>
                {LIGHTS.map((l) => <option key={l} value={l}>{LIGHT_LABELS[l]}</option>)}
              </select>
            </div>
            <div>
              <label>İklim</label>
              <select value={form.climate} onChange={(e) => setForm({ ...form, climate: e.target.value as Climate })}>
                {CLIMATES.map((c) => <option key={c} value={c}>{CLIMATE_LABELS[c]}</option>)}
              </select>
            </div>
          </div>

          <div className="account-form-row">
            <div>
              <label>Bütçe</label>
              <select value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value as Budget })}>
                {BUDGETS.map((b) => <option key={b} value={b}>{BUDGET_LABELS[b]}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ margin: 0 }}>Rüzgârlı alan</label>
              <input type="checkbox" checked={form.windExposed} onChange={(e) => setForm({ ...form, windExposed: e.target.checked })} />
            </div>
          </div>

          <div>
            <label>Kullanım Amacı</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              {USAGES.map((u) => (
                <button key={u} type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.8rem", opacity: form.usages.includes(u) ? 1 : 0.4 }} onClick={() => toggleUsage(u)}>
                  {USAGE_LABELS[u]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label>Alan Fotoğrafı (opsiyonel) — kamera veya galeri</label>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhotoFile} />
            <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoFile} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => cameraRef.current?.click()}>
                <i className="fas fa-camera" /> Kamera
              </button>
              <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => galleryRef.current?.click()}>
                <i className="fas fa-images" /> Galeri
              </button>
              {photoDataUrl && (
                <>
                  <img src={photoDataUrl} alt="Alan fotoğrafı" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 8 }} />
                  <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.8rem", opacity: 0.7 }} onClick={clearPhoto}>Kaldır</button>
                </>
              )}
            </div>
          </div>

          <div>
            <label>Sesli / Yazılı Komut (opsiyonel) — ör. "güney, gölge, premium bostan"</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={startVoice} disabled={voiceListening}>
                <i className="fas fa-microphone" /> {voiceListening ? "Dinliyor…" : "Sesli Komut"}
              </button>
              {voiceTranscript && <span className="account-sub" style={{ margin: 0 }}>“{voiceTranscript}”</span>}
              {voiceError && <span className="account-error" style={{ margin: 0 }}>{voiceError}</span>}
            </div>
            <input value={form.textCommand} onChange={(e) => setForm({ ...form, textCommand: e.target.value })} placeholder="İsteğinizi yazın…" style={{ marginTop: 8 }} />
          </div>

          <button className="btn btn-primary" type="button" onClick={submit} disabled={loading} style={{ justifyContent: "center", alignSelf: "flex-start", marginTop: 14 }}>
            {loading ? "Tasarım Oluşturuluyor…" : "Tasarımı Oluştur"}
          </button>
        </div>
      </div>

      {error && <p className="account-error">{error}</p>}

      {result && (
        <div className="account-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0 }}>Tasarım Sonucu</h2>
            <span className="account-sub" style={{ margin: 0 }}>Alan: {formatTL(result.result.areaSqm)} m² · {result.source === "llm" ? "Yapay Zekâ" : "Kural Tabanlı"}</span>
          </div>

          {/* Mock görsel yerleşim (Visual AI fallback) */}
          <GardenPuzzleEditor
            zones={result.result.zones}
            input={result.input}
            onRecalculated={(data) => setResult((prev) => (prev ? { ...prev, source: "rule-based", result: data.result, visual: data.visual } : prev))}
          />

          <h3>Bölgeleme (Puzzle)</h3>
          {result.result.zones.map((z) => (
            <div className="account-info-row" key={z.id}>
              <span>{z.title} (%{z.areaPercent} — {formatTL(z.areaSqm)} m²)</span>
              <span className="account-sub">{z.description}</span>
            </div>
          ))}

          <h3 style={{ marginTop: 18 }}>Ürün Önerileri (Hibrit BOM)</h3>
          {result.result.items.map((item, i) => (
            <div className="cart-line" key={i} style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <div className="cart-line-name">{item.name} <span className="cart-line-sku">× {item.quantity} {item.unit}</span></div>
                <div className="cart-line-sku">{item.isAffiliate ? `Partner: ${item.vendor ?? "-"}` : `SKU: ${item.sku}`}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {item.price !== null && <div className="cart-line-price">{formatTL(item.price)} ₺</div>}
                {item.isAffiliate ? (
                  <a className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "0.75rem", marginTop: 4 }} href={item.affiliateUrl} target="_blank" rel="noreferrer">Satın Al (Partner) <i className="fas fa-external-link-alt" /></a>
                ) : (
                  <a className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "0.75rem", marginTop: 4 }} href={`/urun/${item.slug}`}>İncele</a>
                )}
              </div>
            </div>
          ))}

          {/* Toplam Tasarım Maliyet Kartı */}
          <h3 style={{ marginTop: 20 }}>Toplam Tasarım Maliyeti</h3>
          <div className="cart-summary-row">
            <span>Kendi Mağazamızdan ({result.result.cost.internalItemCount} kalem)</span>
            <span>{formatTL(result.result.cost.internalSubtotal)} ₺</span>
          </div>
          <div className="cart-summary-row">
            <span>Partner Sitelerden ({result.result.cost.affiliateItemCount} kalem)</span>
            <span>{formatTL(result.result.cost.affiliateSubtotal)} ₺</span>
          </div>
          <div className="cart-summary-row total">
            <span>Toplam Bahçe Tasarım Maliyeti</span>
            <span>{formatTL(result.result.cost.total)} ₺</span>
          </div>

          <button className="btn btn-primary" type="button" onClick={addAllInternal} style={{ justifyContent: "center", marginTop: 14 }}>Tüm İç Ürünleri Sepete Ekle</button>
          {cartMsg && <p className="account-success" style={{ marginTop: 8 }}>{cartMsg}</p>}

          <h3 style={{ marginTop: 20 }}>Bakım Rehberi</h3>
          <ul style={{ paddingLeft: 18 }}>
            {result.result.careGuide.map((tip, i) => <li key={i} className="account-sub">{tip}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
