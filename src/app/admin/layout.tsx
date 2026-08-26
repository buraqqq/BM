import { SessionProviderClient } from "@/components/SessionProviderClient";
import { AdminNav } from "@/components/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProviderClient>
      <div className="admin-body">
        <AdminNav />
        {children}
      </div>
    </SessionProviderClient>
  );
}
