"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { SearchBar } from "@/components/SearchBar";
import { CartBadge } from "@/components/CartBadge";

// FAZ 3 — Bölüm 1/5/6: "Ürünler" (yeni /urunler listeleme sayfası) ve
// header arama kutusu eklendi. Ana sayfaya özel "#kategoriler"/"#iletisim"
// hash linkleri yalnızca ana sayfadayken anlamlıdır — diğer sayfalardan
// (kategori/ürün/arama) tıklanınca önce "/"e gidip sonra o bölüme kayar
// (tarayıcı varsayılan davranışı, ek kod gerekmedi).
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  // FAZ 4A — Bölüm 1/24: header'da hesap durumu + sepet rozeti. `status`
  // "loading" iken hiçbir şey varsayılmıyor (giriş linkinin bir an "Giriş
  // Yap" gösterip hemen "Hesabım"a dönmesi gibi bir titremeyi önler).
  const { data: session, status } = useSession();
  const isCustomer = status === "authenticated" && session?.user?.kind === "customer";

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <a href="/" className="logo">
            <span className="logo-b">B</span>
            <span className="logo-amp">&</span>
            <span className="logo-m">M</span>
            <span className="logo-text">Vourla</span>
          </a>
          <div className="header-search">
            <SearchBar />
          </div>
          <nav className="nav">
            <a href="/">Ana Sayfa</a>
            <a href="/urunler">Ürünler</a>
            <a href="/#kategoriler">Kategoriler</a>
            <a href="/#iletisim">İletişim</a>
            <a href={isCustomer ? "/hesabim" : "/giris"}>{isCustomer ? "Hesabım" : "Giriş Yap"}</a>
            <a href="/admin" className="btn-nav">
              Yönetim
            </a>
          </nav>
          <CartBadge />
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
        <div style={{ marginBottom: 14 }}>
          <SearchBar />
        </div>
        <a href="/" className="mobile-link" onClick={() => setOpen(false)}>
          Ana Sayfa
        </a>
        <a href="/urunler" className="mobile-link" onClick={() => setOpen(false)}>
          Ürünler
        </a>
        <a href="/#kategoriler" className="mobile-link" onClick={() => setOpen(false)}>
          Kategoriler
        </a>
        <a href="/#iletisim" className="mobile-link" onClick={() => setOpen(false)}>
          İletişim
        </a>
        <a href={isCustomer ? "/hesabim" : "/giris"} className="mobile-link" onClick={() => setOpen(false)}>
          {isCustomer ? "Hesabım" : "Giriş Yap"}
        </a>
        <a href="/sepet" className="mobile-link" onClick={() => setOpen(false)}>
          Sepetim
        </a>
        <a href="/admin" className="mobile-link" onClick={() => setOpen(false)}>
          Yönetim
        </a>
      </div>
    </>
  );
}
