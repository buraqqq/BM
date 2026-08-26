"use client";

import { useEffect, useState } from "react";

// FAZ 5 — PWA: Service Worker kaydı + "Uygulamayı Yükle" (install) prompt'u.
// Tarayıcı `beforeinstallprompt` yayınladığında (kurulabilir olduğunda) bir
// yükleme butonu gösterir; tıklanınca native install akışını başlatır.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW kaydı başarısız olsa bile uygulama çalışmaya devam eder */
      });
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt) return null;

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <button
      type="button"
      onClick={install}
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#E65100",
        color: "#fff",
        border: "none",
        borderRadius: 24,
        padding: "10px 16px",
        fontSize: "0.85rem",
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
      }}
    >
      <i className="fas fa-download" /> Uygulamayı Yükle
    </button>
  );
}
