import { AdminNav } from "@/components/AdminNav";

// FAZ 4A: SessionProvider artık kök layout'ta (bkz. src/app/layout.tsx) —
// burada kaldırıldı, useSession() hâlâ AYNI şekilde çalışıyor (context
// yukarıdan geliyor).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-body">
      <AdminNav />
      {children}
    </div>
  );
}
