"use client";

import { useEffect, useState } from "react";

export interface PublicProduct {
  id: string;
  name: string;
  unitLabel: string;
  price: {
    base: number;
    final: number;
    compareAt: number | null;
    discountSource: "campaign" | "sale" | "none";
    discountPercent: number | null;
    campaign: { name: string } | null;
  };
}

export interface PublicCategory {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  icon: string | null;
  color: string | null;
  productCount?: number;
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

export function CategoryGrid({
  categories,
  productsByCategory,
}: {
  categories: PublicCategory[];
  productsByCategory: Record<string, PublicProduct[]>;
}) {
  const [active, setActive] = useState<PublicCategory | null>(null);

  useEffect(() => {
    document.body.style.overflow = active ? "hidden" : "";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActive(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <>
      <div className="cat-grid" id="catGrid">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="cat-card"
            style={{ ["--cat-color" as string]: cat.color ?? "#E65100" }}
            onClick={() => setActive(cat)}
          >
            <span className="cat-icon">
              <i className={`fas ${cat.icon ?? "fa-leaf"}`} />
            </span>
            <h3>{cat.title}</h3>
            <p>{cat.shortDescription}</p>
            <span className="cat-count">{cat.productCount ?? productsByCategory[cat.slug]?.length ?? 0} ürün</span>
          </div>
        ))}
      </div>

      <div className={`modal-overlay${active ? " active" : ""}`} onClick={(e) => e.target === e.currentTarget && setActive(null)}>
        <div className="modal">
          <button className="modal-close" onClick={() => setActive(null)} aria-label="Kapat">
            <i className="fas fa-times" />
          </button>
          {active && (
            <div id="modalBody">
              <div className="modal-header">
                <span className="modal-icon">
                  <i className={`fas ${active.icon ?? "fa-leaf"}`} />
                </span>
                <h2>{active.title}</h2>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>{active.shortDescription}</p>
              </div>
              <ul className="modal-list">
                {(productsByCategory[active.slug] ?? []).map((p) => (
                  <li key={p.id}>
                    <span className="modal-name">{p.name}</span>
                    <span className="modal-price">
                      {p.price.discountSource !== "none" && (
                        <>
                          <span className="old-price">{formatTL(p.price.base)}</span>
                        </>
                      )}
                      {formatTL(p.price.final)} {p.unitLabel}
                      {p.price.discountSource === "campaign" && p.price.discountPercent ? (
                        <span className="campaign-badge">-%{p.price.discountPercent}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
