import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Plane, Car, MessageSquare, MoreHorizontal, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MobileAdminLayoutProps {
  children: ReactNode;
  title?: string;
}

const tabs = [
  { path: "/m", icon: LayoutDashboard, label: "Home" },
  { path: "/m/orders", icon: ShoppingCart, label: "Orders" },
  { path: "/m/requests", icon: Plane, label: "Flights" },
  { path: "/m/car-rentals", icon: Car, label: "Cars" },
  { path: "/m/maya", icon: MessageSquare, label: "Maya" },
  { path: "/m/more", icon: MoreHorizontal, label: "More" },
];

export function MobileAdminLayout({ children, title }: MobileAdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate("/m/login", { replace: true });
        return;
      }
      // Verify admin/staff
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "staff"]);

      if (!roles?.length) {
        navigate("/m/login", { replace: true });
        return;
      }
      setAuthed(true);
    });
  }, [navigate]);

  const isActive = (path: string) => {
    if (path === "/m") return location.pathname === "/m";
    return location.pathname.startsWith(path);
  };

  if (authed === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="h-[env(safe-area-inset-top)]" />

      {title && (
        <header className="px-4 py-3 border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-40">
          <h1 className="text-lg font-bold font-display">{title}</h1>
        </header>
      )}

      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/50">
        <div className="flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] h-16">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <tab.icon className={`w-5 h-5 ${active ? "drop-shadow-[0_0_6px_hsl(var(--primary))]" : ""}`} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}