import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Plane, Car, MessageSquare, MoreHorizontal } from "lucide-react";

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

  const isActive = (path: string) => {
    if (path === "/m") return location.pathname === "/m";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Status bar spacer */}
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Top bar */}
      {title && (
        <header className="px-4 py-3 border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-40">
          <h1 className="text-lg font-bold font-display">{title}</h1>
        </header>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/50">
        <div className="flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] h-16">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground"
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
