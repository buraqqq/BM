"use client";

import { useState } from "react";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <a href="#home" className="logo">
            <span className="logo-b">B</span>
            <span className="logo-amp">&</span>
            <span className="logo-m">M</span>
            <span className="logo-text">Vourla</span>
          </a>
          <nav className="nav">
            <a href="#home">Ana Sayfa</a>
            <a href="#kategoriler">Kategoriler</a>
            <a href="#iletisim">İletişim</a>
            <a href="/admin" className="btn-nav">
              Yönetim
            </a>
          </nav>
          <button className="mobile-btn" onClick={() => setOpen(true)} aria-label="Menü">
            <i className="fas fa-bars" />
          </button>
        </div>
      </header>

      <div className={`mobile-menu${open ? " active" : ""}`}>
        <div className="mobile-menu-header">
          <span>B&M Vourla</span>
          <button className="mobile-close" onClick={() => setOpen(false)} aria-label="Kapat">
            <i className="fas fa-times" />
          </button>
        </div>
        <a href="#home" className="mobile-link" onClick={() => setOpen(false)}>
          Ana Sayfa
        </a>
        <a href="#kategoriler" className="mobile-link" onClick={() => setOpen(false)}>
          Kategoriler
        </a>
        <a href="#iletisim" className="mobile-link" onClick={() => setOpen(false)}>
          İletişim
        </a>
        <a href="/admin" className="mobile-link" onClick={() => setOpen(false)}>
          Yönetim
        </a>
      </div>
    </>
  );
}
