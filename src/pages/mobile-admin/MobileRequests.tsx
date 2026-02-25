import { useState, useEffect } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function MobileRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("ticket_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setRequests(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = requests.filter(
    (r) =>
      `${r.origin} ${r.destination} ${r.contact_email}`.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (status: string) => {
    switch (status) {
      case "submitted": return "bg-warning/20 text-warning border-warning/30";
      case "quoted": return "bg-primary/20 text-primary border-primary/30";
      case "ticketed": return "bg-success/20 text-success border-success/30";
      case "cancelled": return "bg-destructive/20 text-destructive border-destructive/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <MobileAdminLayout title="Ticket Requests">
      <div className="px-4 pt-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search routes or emails..."
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
            {filtered.map((req) => (
              <div
                key={req.id}
                className="bg-card border border-border/30 rounded-xl p-4 active:bg-secondary transition-colors"
              >
                <div className="flex items-start justify-between mb-1">
                  <p className="text-sm font-bold">{req.origin} → {req.destination}</p>
                  <Badge variant="outline" className={`text-[10px] ${statusColor(req.status)}`}>
                    {req.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>{req.departure_date}{req.return_date ? ` — ${req.return_date}` : ""} · {req.passengers} pax</p>
                  <p>{req.cabin_class} · {req.contact_email}</p>
                  {req.quoted_price && (
                    <p className="text-accent font-semibold">Quoted: ${req.quoted_price}</p>
                  )}
                  {req.special_notes && (
                    <p className="italic truncate mt-1">{req.special_notes}</p>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No requests found</p>
            )}
          </div>
        )}
      </div>
    </MobileAdminLayout>
  );
}
