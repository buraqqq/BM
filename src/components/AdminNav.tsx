"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const LINKS = [
  { href: "/admin/products", label: "Ürünler", icon: "fa-box" },
  { href: "/admin/categories", label: "Kategoriler", icon: "fa-layer-group" },
  { href: "/admin/brands", label: "Markalar", icon: "fa-copyright" },
  { href: "/admin/attributes", label: "Özellikler", icon: "fa-list-check" },
  { href: "/admin/import-export", label: "İçe/Dışa Aktar", icon: "fa-file-csv" },
  { href: "/admin/inventory", label: "Stok", icon: "fa-warehouse" },
  { href: "/admin/pricing", label: "Fiyatlandırma", icon: "fa-tags" },
  { href: "/admin/campaigns", label: "Kampanyalar", icon: "fa-bullhorn" },
  { href: "/admin/banners", label: "Bannerlar", icon: "fa-image" },
  { href: "/admin/audit-log", label: "Denetim Kaydı", icon: "fa-clipboard-list" },
  { href: "/admin/settings", label: "Ayarlar", icon: "fa-gear" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  if (pathname === "/admin/login") return null;

  return (
    <>
      <header className="admin-header">
        <h1>
          <i className="fas fa-seedling" /> B&amp;M Vourla — Yönetim Paneli
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.85rem" }}>
          {session?.user && (
            <span>
              {session.user.name} <span style={{ opacity: 0.7 }}>({session.user.role})</span>
            </span>
          )}
          <button
            className="admin-btn secondary"
            onClick={async () => {
              await signOut({ redirect: false });
              router.push("/admin/login");
              router.refresh();
            }}
          >
            Çıkış
          </button>
        </div>
      </header>
      <nav className="admin-nav">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className={pathname?.startsWith(l.href) ? "active" : ""}>
            <i className={`fas ${l.icon}`} /> {l.label}
          </a>
        ))}
      </nav>
    </>
  );
}
