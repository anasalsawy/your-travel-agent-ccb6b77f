import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  ShoppingCart, Plane, MessageSquare, Phone, Mail, CreditCard,
  TrendingUp, Bell, ChevronRight, Loader2, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Stats {
  pendingOrders: number;
  pendingRequests: number;
  activeConversations: number;
  todayQuotes: number;
  pendingCalls: number;
}

interface RecentActivity {
  id: string;
  type: "order" | "request" | "conversation" | "quote";
  title: string;
  subtitle: string;
  time: string;
}

export default function MobileHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, requestsRes, convoRes, quotesRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).in("order_status", ["pending", "payment_under_review"]),
        supabase.from("ticket_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "quoted"]),
        supabase.from("ai_conversations").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("quote_logs").select("id", { count: "exact", head: true }).gte("created_at", new Date().toISOString().split("T")[0]),
      ]);

      setStats({
        pendingOrders: ordersRes.count || 0,
        pendingRequests: requestsRes.count || 0,
        activeConversations: convoRes.count || 0,
        todayQuotes: quotesRes.count || 0,
        pendingCalls: 0,
      });

      // Recent activity
      const { data: recentRequests } = await supabase
        .from("ticket_requests")
        .select("id, origin, destination, status, created_at, contact_email")
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: recentOrders } = await supabase
        .from("orders")
        .select("id, amount_paid, order_status, created_at, customer_email")
        .order("created_at", { ascending: false })
        .limit(5);

      const merged: RecentActivity[] = [
        ...(recentRequests || []).map((r) => ({
          id: r.id,
          type: "request" as const,
          title: `${r.origin} → ${r.destination}`,
          subtitle: `${r.status} · ${r.contact_email || "No email"}`,
          time: new Date(r.created_at!).toLocaleString(),
        })),
        ...(recentOrders || []).map((o) => ({
          id: o.id,
          type: "order" as const,
          title: `Order $${o.amount_paid}`,
          subtitle: `${o.order_status} · ${o.customer_email || "No email"}`,
          time: new Date(o.created_at!).toLocaleString(),
        })),
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);

      setRecent(merged);
    } catch (err) {
      console.error("Failed to fetch stats", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const statCards = stats ? [
    { label: "Pending Orders", value: stats.pendingOrders, icon: ShoppingCart, color: "text-warning", path: "/m/orders" },
    { label: "Ticket Requests", value: stats.pendingRequests, icon: Plane, color: "text-accent", path: "/m/requests" },
    { label: "Active Chats", value: stats.activeConversations, icon: MessageSquare, color: "text-primary", path: "/m/maya" },
    { label: "Today's Quotes", value: stats.todayQuotes, icon: TrendingUp, color: "text-success", path: "/m/more" },
  ] : [];

  const quickActions = [
    { label: "Send Quote Email", icon: Mail, path: "/m/send-quote" },
    { label: "Call Logs", icon: Phone, path: "/m/more" },
    { label: "Inventory", icon: CreditCard, path: "/m/more" },
    { label: "Notifications", icon: Bell, path: "/m/notifications" },
  ];

  if (loading) {
    return (
      <MobileAdminLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MobileAdminLayout>
    );
  }

  return (
    <MobileAdminLayout>
      <div className="px-4 pt-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display">Command Center</h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchData} className="rounded-full">
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((card) => (
            <button
              key={card.label}
              onClick={() => navigate(card.path)}
              className="bg-card border border-border/50 rounded-2xl p-4 text-left active:scale-95 transition-transform"
            >
              <card.icon className={`w-5 h-5 ${card.color} mb-2`} />
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            </button>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-secondary/50 active:bg-secondary transition-colors"
              >
                <action.icon className="w-5 h-5 text-primary" />
                <span className="text-[10px] text-center text-muted-foreground leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Recent Activity</h2>
          <div className="space-y-1">
            {recent.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.type === "order" ? "/m/orders" : "/m/requests")}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/30 active:bg-secondary transition-colors"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  item.type === "order" ? "bg-warning/20" : "bg-accent/20"
                }`}>
                  {item.type === "order" ? (
                    <ShoppingCart className="w-4 h-4 text-warning" />
                  ) : (
                    <Plane className="w-4 h-4 text-accent" />
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </MobileAdminLayout>
  );
}
