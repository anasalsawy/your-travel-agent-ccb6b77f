import { useState, useEffect } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function MobileOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, vouchers(title, airline)")
        .order("created_at", { ascending: false })
        .limit(50);
      setOrders(data || []);
      setLoading(false);
    };
    fetchOrders();
  }, []);

  const filtered = orders.filter(
    (o) =>
      (o.customer_email || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.id || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-success/20 text-success border-success/30";
      case "pending": return "bg-warning/20 text-warning border-warning/30";
      case "cancelled": return "bg-destructive/20 text-destructive border-destructive/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <MobileAdminLayout title="Orders">
      <div className="px-4 pt-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/30 rounded-xl"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => (
              <div
                key={order.id}
                className="bg-card border border-border/30 rounded-xl p-4 active:bg-secondary transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">${order.amount_paid}</p>
                    <p className="text-xs text-muted-foreground truncate">{order.customer_email || "No email"}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${statusColor(order.order_status)}`}>
                    {order.order_status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{order.payment_method}</span>
                  <span>{new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                {order.vouchers && (
                  <p className="text-xs text-accent mt-1 truncate">{order.vouchers.airline} — {order.vouchers.title}</p>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No orders found</p>
            )}
          </div>
        )}
      </div>
    </MobileAdminLayout>
  );
}
