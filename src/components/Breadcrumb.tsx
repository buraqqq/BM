import type { BreadcrumbItem } from "@/lib/breadcrumb";

/** Görsel breadcrumb — JSON-LD ayrı olarak buildBreadcrumbJsonLd + JsonLd ile eklenir (SEO Bölüm 7). */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="breadcrumb" className="breadcrumb">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="breadcrumb-item">
          {i > 0 && <span className="breadcrumb-sep">/</span>}
          {item.href !== "#" && i < items.length - 1 ? (
            <a href={item.href}>{item.label}</a>
          ) : (
            <span aria-current={i === items.length - 1 ? "page" : undefined}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
