import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plane, Ticket, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Booking {
  id: string;
  status: string;
  offer_id: string;
  duffel_order_id?: string;
  booking_reference?: string;
  customer_amount: number;
  customer_currency: string;
  contact_email: string;
  created_at: string;
  duffel_order?: any;
}

export default function MyFlights() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelQuote, setCancelQuote] = useState<any>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        navigate("/auth");
        return;
      }
      const { data, error } = await supabase.functions.invoke("duffel-list-bookings", { body: {} });
      if (error) throw error;
      setBookings(data?.bookings || []);
    } catch (e: any) {
      toast({ title: "Failed to load bookings", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCancel = async (b: Booking) => {
    setCancelTarget(b);
    setCancelQuote(null);
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("duffel-order-cancel", {
        body: { booking_id: b.id, action: "quote" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setCancelQuote(data.cancellation);
    } catch (e: any) {
      toast({ title: "Cannot quote cancellation", description: e.message, variant: "destructive" });
      setCancelTarget(null);
    } finally {
      setCancelLoading(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget || !cancelQuote) return;
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("duffel-order-cancel", {
        body: { booking_id: cancelTarget.id, action: "confirm", cancellation_id: cancelQuote.id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: "Cancellation confirmed", description: "Refund: " + (data.cancellation?.refund_amount || "0") });
      setCancelTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" });
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-display font-bold mb-2">My Flights</h1>
        <p className="text-muted-foreground mb-8">Your booked flights and e-tickets.</p>

        {loading && (
          <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
        )}

        {!loading && bookings.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground">
            No flights yet. <Button variant="link" onClick={() => navigate("/flights")}>Search flights</Button>
          </Card>
        )}

        <div className="space-y-4">
          {bookings.map((b) => {
            const order = b.duffel_order;
            const slices = order?.slices || [];
            return (
              <Card key={b.id} className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Ticket className="w-4 h-4 text-primary" />
                      <span className="font-mono text-sm font-semibold">
                        {b.booking_reference || "Pending PNR"}
                      </span>
                      <Badge variant={
                        b.status === "confirmed" ? "default" :
                        b.status === "cancelled" ? "destructive" : "secondary"
                      }>{b.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Booked {format(new Date(b.created_at), "MMM d, yyyy")} · {b.contact_email}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      ${b.customer_amount.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">{b.customer_currency}</div>
                  </div>
                </div>

                {slices.map((s: any, i: number) => (
                  <div key={i} className="border-t pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
                    {s.segments?.map((seg: any, si: number) => (
                      <div key={si} className="flex items-center gap-3 text-sm py-1">
                        <Plane className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-semibold">{seg.origin?.iata_code} → {seg.destination?.iata_code}</span>
                        <span className="text-muted-foreground">
                          {seg.marketing_carrier?.iata_code} {seg.marketing_carrier_flight_number}
                        </span>
                        <span className="text-muted-foreground ml-auto">
                          {seg.departing_at && format(new Date(seg.departing_at), "MMM d HH:mm")}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}

                {b.status === "confirmed" && (
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => openCancel(b)}>
                      Cancel & Refund
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Confirm Cancellation
            </DialogTitle>
          </DialogHeader>
          {cancelLoading && !cancelQuote && (
            <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          )}
          {cancelQuote && (
            <div className="space-y-3">
              <p className="text-sm">You are cancelling booking <strong>{cancelTarget?.booking_reference}</strong>.</p>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Refund Amount</div>
                <div className="text-2xl font-bold">
                  ${cancelQuote.refund_amount} {cancelQuote.refund_currency}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Refunded to: {cancelQuote.refund_to}
                </div>
              </Card>
              <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep Booking</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={!cancelQuote || cancelLoading}>
              {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
