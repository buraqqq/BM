/**
 * FAZ 3 — Bölüm 5: header'daki arama kutusu. Basit bir GET <form> —
 * /arama sayfasına yönlendirir, sunucu tarafında src/lib/search.ts ile
 * işlenir. Otomatik tamamlama/öneri (AI destekli arama dahil) FAZ 3
 * kapsamına girmedi; mimari zaten buna uygun (bkz. search.ts başındaki not)
 * — ileride bir öneri dropdown'u eklenmek istendiğinde bu bileşen client
 * component'e çevrilip debounce'lu bir /api/products?search= çağrısı
 * eklenebilir, sunucu tarafı değişmeden.
 */
export function SearchBar({ defaultValue = "", compact = false }: { defaultValue?: string; compact?: boolean }) {
  return (
    <form action="/arama" method="GET" className={`search-bar${compact ? " search-bar-compact" : ""}`} role="search">
      <label htmlFor="search-input" className="sr-only">
        Ürün, SKU, marka veya kategori ara
      </label>
      <input
        id="search-input"
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Ürün, SKU, marka veya kategori ara…"
        autoComplete="off"
      />
      <button type="submit" aria-label="Ara">
        <i className="fas fa-search" />
      </button>
    </form>
  );
}
