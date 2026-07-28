import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Gavel, CheckCircle2, XCircle, Clock, Radar, DollarSign } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function NyopWaitingRoomPage() {
  const { bidId } = useParams<{ bidId: string }>();
  const [bid, setBid] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bidId) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase.from("nyop_bids").select("*").eq("id", bidId).maybeSingle();
      if (!cancelled) { setBid(data); setLoading(false); }
    };
    load();

    const channel = supabase.channel("nyop:" + bidId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "nyop_bids", filter: "id=eq." + bidId },
        (payload) => { if (!cancelled) setBid(payload.new); })
      .subscribe();

    const poll = setInterval(load, 15000);
    return () => { cancelled = true; supabase.removeChannel(channel); clearInterval(poll); };
  }, [bidId]);

  const cancelBid = async () => {
    if (!bidId) return;
    await supabase.from("nyop_bids").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", bidId);
  };

  if (loading) return <Layout><div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;
  if (!bid) return <Layout><div className="max-w-xl mx-auto py-16 px-4 text-center"><h1 className="text-2xl font-bold">Bid not found</h1><Link to="/request-ticket" className="text-primary underline mt-4 inline-block">Place a new bid</Link></div></Layout>;

  const statusMap: Record<string, { label: string; color: string; icon: any }> = {
    hunting:   { label: "Hunting for your fare",   color: "text-primary",       icon: Radar },
    matched:   { label: "Match found — check email", color: "text-emerald-600", icon: CheckCircle2 },
    accepted:  { label: "Payment received — booking", color: "text-emerald-600", icon: CheckCircle2 },
    booked:    { label: "Ticketed",                color: "text-emerald-600",   icon: CheckCircle2 },
    expired:   { label: "No match found in time",  color: "text-muted-foreground", icon: Clock },
    cancelled: { label: "Cancelled",               color: "text-muted-foreground", icon: XCircle },
  };
  const s = statusMap[bid.status] || statusMap.hunting;
  const Icon = s.icon;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
        <div className="glass-card p-6 md:p-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Gavel className="w-4 h-4" /> Your bid
          </div>
          <div className={"text-5xl font-bold flex items-center justify-center gap-1"}>
            <DollarSign className="w-8 h-8" />{parseFloat(bid.bid_amount).toFixed(0)}
          </div>
          <p className="text-muted-foreground mt-2">{bid.origin} → {bid.destination} · {bid.departure_date}{bid.return_date && ` → ${bid.return_date}`} · {bid.passengers} pax</p>

          <div className={"mt-6 flex items-center justify-center gap-2 text-lg font-semibold " + s.color}>
            {bid.status === "hunting" ? <Icon className="w-5 h-5 animate-pulse" /> : <Icon className="w-5 h-5" />}
            {s.label}
          </div>
        </div>

        <div className="glass-card p-6 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Attempts so far</span><span className="font-medium">{bid.attempts_count || 0}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Best fare seen</span><span className="font-medium">{bid.best_offer_seen_amount ? `$${parseFloat(bid.best_offer_seen_amount).toFixed(2)}` : "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Last check</span><span className="font-medium">{bid.last_hunt_at ? formatDistanceToNow(new Date(bid.last_hunt_at), { addSuffix: true }) : "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Expires</span><span className="font-medium">{formatDistanceToNow(new Date(bid.expires_at), { addSuffix: true })}</span></div>
        </div>

        {bid.status === "hunting" && (
          <Button variant="outline" className="w-full" onClick={cancelBid}>Cancel my bid</Button>
        )}
        {bid.status === "expired" && (
          <Link to="/flights"><Button className="w-full">See current fares instead</Button></Link>
        )}
        {bid.status === "matched" && (
          <div className="text-center text-sm text-muted-foreground">Check <b>{bid.contact_email}</b> for a secure link to pay ${parseFloat(bid.bid_amount).toFixed(0)} and confirm your ticket.</div>
        )}
      </div>
    </Layout>
  );
}
