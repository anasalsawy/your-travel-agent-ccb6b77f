import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface FlightDeal {
  id: string;
  destination_name: string | null;
  country: string | null;
  departure_airport_code: string | null;
  arrival_airport_code: string | null;
  airline: string | null;
  stops: number | null;
  outbound_date: string | null;
  return_date: string | null;
  currency: string;
  our_price: number;
  flight_link: string | null;
}

const REFRESH_MS = 5 * 60 * 1000;

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

function formatDates(deal: FlightDeal) {
  if (!deal.outbound_date) return "Flexible dates";
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return deal.return_date ? `${fmt(deal.outbound_date)} – ${fmt(deal.return_date)}` : fmt(deal.outbound_date);
}

export function DealsSection() {
  const [deals, setDeals] = useState<FlightDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("serpapi-deals", {
        body: { limit: 9, force },
      });
      if (!error && data?.deals) {
        setDeals(data.deals as FlightDeal[]);
        setUpdatedAt(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!loading && deals.length === 0) return null;

  return (
    <section className="border-t border-slate-800 bg-slate-950 py-14">
      <div className="container mx-auto px-4">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Exclusive Deals</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Live fares sourced from Google Flights and re-quoted at our exclusive wholesale rate.
              {updatedAt && (
                <span className="ml-1 text-slate-500">
                  Updated {updatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={loading}
            className="rounded-full border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {loading && deals.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-40 animate-pulse border-slate-800 bg-slate-900" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((deal) => (
              <Card
                key={deal.id}
                className="flex flex-col justify-between border-slate-800 bg-slate-900 p-5 transition-colors hover:border-sky-600"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-400">
                    <Plane className="h-3.5 w-3.5" />
                    {deal.departure_airport_code ?? "—"} → {deal.arrival_airport_code ?? "—"}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-white">
                    {deal.destination_name ?? deal.arrival_airport_code}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {deal.country ? `${deal.country} · ` : ""}
                    {formatDates(deal)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {deal.airline ?? "Multiple carriers"}
                    {deal.stops === 0 ? " · Nonstop" : deal.stops ? ` · ${deal.stops} stop(s)` : ""}
                    {deal.return_date ? " · Round trip" : " · One way"}
                  </p>
                </div>

                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Our price</div>
                    <div className="text-2xl font-bold text-white">
                      {formatMoney(Number(deal.our_price), deal.currency)}
                    </div>
                  </div>
                  <Button asChild size="sm" className="bg-sky-600 text-white hover:bg-sky-500">
                    <Link
                      to="/request-ticket"
                      state={{
                        prefill: {
                          product: "flights",
                          route: `${deal.departure_airport_code} → ${deal.arrival_airport_code}`,
                          price: deal.our_price,
                          currency: deal.currency,
                          departure_date: deal.outbound_date,
                          return_date: deal.return_date,
                        },
                      }}
                    >
                      Book <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default DealsSection;
