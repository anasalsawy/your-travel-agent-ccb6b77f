import { useState, useEffect } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Car, MapPin, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function MobileCarRentals() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("car_rental_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setRequests(data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filtered = requests.filter(
    (r) =>
      `${r.pickup_location} ${r.dropoff_location || ""} ${r.contact_email} ${r.car_type || ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  const statusColor = (status: string) => {
    switch (status) {
      case "submitted": return "bg-warning/20 text-warning border-warning/30";
      case "quoted": return "bg-primary/20 text-primary border-primary/30";
      case "confirmed": return "bg-success/20 text-success border-success/30";
      case "cancelled": return "bg-destructive/20 text-destructive border-destructive/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const formatDate = (d: string) => {
    try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
  };

  return (
    <MobileAdminLayout title="Car Rentals">
      <div className="px-4 pt-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search locations or emails..."
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
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-primary" />
                    <p className="text-sm font-bold capitalize">{req.car_type || "Any"} · {req.transmission || "Auto"}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${statusColor(req.status)}`}>
                    {req.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    <span>{req.pickup_location}{req.dropoff_location && req.dropoff_location !== req.pickup_location ? ` → ${req.dropoff_location}` : ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(req.pickup_date)} — {formatDate(req.dropoff_date)}</span>
                  </div>
                  <p>{req.contact_email}{req.contact_phone ? ` · ${req.contact_phone}` : ""}</p>
                  {req.budget && <p>Budget: ${req.budget}</p>}
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
              <p className="text-center text-muted-foreground py-8 text-sm">No car rental requests found</p>
            )}
          </div>
        )}
      </div>
    </MobileAdminLayout>
  );
}
