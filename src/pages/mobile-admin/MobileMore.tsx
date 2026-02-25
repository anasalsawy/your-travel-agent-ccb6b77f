import { useNavigate } from "react-router-dom";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  Phone, PhoneCall, CreditCard, TrendingUp, Mail, Package, Shield, Users,
  Building2, Settings, Bell, LogOut, ChevronRight, Mic, Code, LayoutGrid
} from "lucide-react";

const sections = [
  {
    title: "Full Admin Panel",
    items: [
      { label: "Open Full Admin Panel", icon: LayoutGrid, path: "/m/admin", highlight: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Quote Logs", icon: TrendingUp, path: "/m/admin?tab=quote-logs" },
      { label: "Call Logs", icon: PhoneCall, path: "/m/admin?tab=call-logs" },
      { label: "Inventory", icon: CreditCard, path: "/m/admin?tab=inventory" },
      { label: "Send Quote", icon: Mail, path: "/m/send-quote" },
    ],
  },
  {
    title: "Voice",
    items: [
      { label: "Book by Phone", icon: Phone, path: "/m/admin?tab=book-call" },
      { label: "Voice Proxy", icon: Mic, path: "/m/admin?tab=voice-proxy" },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Vouchers", icon: Package, path: "/m/admin?tab=vouchers" },
      { label: "Sellers", icon: Building2, path: "/m/admin?tab=sellers" },
      { label: "Escrow", icon: Shield, path: "/m/admin?tab=escrow" },
      { label: "Users", icon: Users, path: "/m/admin?tab=users" },
      { label: "Promo Emails", icon: Mail, path: "/m/admin?tab=promo-emails" },
      { label: "Settings", icon: Settings, path: "/m/admin?tab=settings" },
    ],
  },
  {
    title: "Developer",
    items: [
      { label: "Dev Agent", icon: Code, path: "/m/dev" },
      { label: "AI Roundtable", icon: Users, path: "/m/roundtable" },
    ],
  },
];

export default function MobileMore() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/m/login");
  };

  return (
    <MobileAdminLayout title="More">
      <div className="px-4 pt-3 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              {section.title}
            </h2>
            <div className="bg-card border border-border/30 rounded-2xl overflow-hidden divide-y divide-border/20">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 active:bg-secondary transition-colors ${
                    (item as any).highlight ? "bg-primary/5" : ""
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${(item as any).highlight ? "text-primary" : "text-primary"}`} />
                  <span className={`flex-1 text-left text-sm ${(item as any).highlight ? "font-semibold" : ""}`}>{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-destructive/10 border border-destructive/20 active:bg-destructive/20 transition-colors"
        >
          <LogOut className="w-5 h-5 text-destructive" />
          <span className="text-sm text-destructive font-medium">Sign Out</span>
        </button>

        <div className="h-4" />
      </div>
    </MobileAdminLayout>
  );
}
