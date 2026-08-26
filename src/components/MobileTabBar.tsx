/**
 * FAZ 3 — Bölüm 6: mobilde hızlı navigasyon için alt sabit sekme çubuğu.
 * Yalnızca public sayfalarda kullanılır (admin kendi navigasyonuna sahip —
 * bkz. src/components/AdminNav.tsx); bu yüzden ortak bir root layout'a
 * değil, her public sayfaya (SiteHeader ile aynı yerde) tek tek eklenir —
 * mevcut kod tabanının SiteHeader/footer için zaten kullandığı desenle
 * tutarlı (bkz. src/app/page.tsx, kategori/urun sayfaları).
 * CSS ile yalnızca @media (max-width: 768px) altında görünür.
 */
export function MobileTabBar({ whatsappNumber }: { whatsappNumber: string }) {
  return (
    <nav className="mobile-tabbar" aria-label="Hızlı gezinme">
      <a href="/">
        <i className="fas fa-home" />
        <span>Ana Sayfa</span>
      </a>
      <a href="/urunler">
        <i className="fas fa-th-large" />
        <span>Ürünler</span>
      </a>
      <a href="/arama">
        <i className="fas fa-search" />
        <span>Ara</span>
      </a>
      <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">
        <i className="fab fa-whatsapp" />
        <span>Sipariş</span>
      </a>
    </nav>
  );
}
