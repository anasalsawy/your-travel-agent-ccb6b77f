// Inline "pay by card" surface for the public Flights page.
// Uses Duffel's hosted card component (browser-side 3DS + tokenisation) then
// calls duffel-book-customer-card to place the order using that card_id.
// Falls back to Stripe checkout when the user picks that button.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DuffelPayments as DuffelPaymentsRaw } from "@duffel/components";

const DuffelPayments = DuffelPaymentsRaw as unknown as React.ComponentType<any>;

const SUPABASE_URL = "https://wpwdxtyufpewdyffxlgo.supabase.co";

type Props = {
  offerId: string;
  amount: number;
  currency: string;
  passengers: any[];
  contactEmail: string;
  contactPhone: string;
  mode?: "test" | "live";
  onSuccess: (result: { booking_id: string; order_id: string; booking_reference: string }) => void;
  onFallbackToStripe: () => void;
};

export function CustomerCardCheckout({
  offerId, amount, currency, passengers, contactEmail, contactPhone,
  mode = "test", onSuccess, onFallbackToStripe,
}: Props) {
  const [clientKey, setClientKey] = useState<string | null>(null);
  const [initErr, setInitErr] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/duffel-client-key`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-duffel-mode": mode,
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({}),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to init card checkout");
        if (alive) setClientKey(json.client_key);
      } catch (e: any) {
        if (alive) setInitErr(e.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [mode]);

  const bookWithCard = async (cardResult: any) => {
    // Duffel returns either a card object (id = tcd_...) or a payment result
    // that already carries a three_d_secure_session_id. Cover both shapes.
    setBooking(true);
    try {
      const cardId: string | undefined =
        cardResult?.id || cardResult?.card?.id || cardResult?.card_id;
      let sessionId: string | undefined =
        cardResult?.three_d_secure_session_id ||
        cardResult?.session?.id ||
        cardResult?.threeDSecureSession?.id;

      if (!cardId) throw new Error("Card token missing from Duffel response");

      if (!sessionId) {
        // Create a 3DS session for this card + offer
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(`${SUPABASE_URL}/functions/v1/duffel-3ds-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-duffel-mode": mode,
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            card_id: cardId,
            resource_id: offerId,
            amount,
            currency,
            services: [],
          }),
        });
        const jr = await r.json();
        if (!r.ok) throw new Error(jr?.detail?.errors?.[0]?.message || jr.error || "3DS session failed");
        sessionId = jr.session?.id;
        if (jr.session?.status && jr.session.status !== "ready") {
          throw new Error(`Card requires further verification (status: ${jr.session.status}). Please use Stripe checkout as fallback.`);
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      const r2 = await fetch(`${SUPABASE_URL}/functions/v1/duffel-book-customer-card`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-duffel-mode": mode,
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          offer_id: offerId,
          passengers,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          three_d_secure_session_id: sessionId,
          mode,
        }),
      });
      const jr2 = await r2.json();
      if (!r2.ok) throw new Error(jr2?.detail?.errors?.[0]?.message || jr2.error || "Booking failed");
      toast.success("Booked! " + (jr2.booking_reference || jr2.order_id));
      onSuccess({
        booking_id: jr2.booking_id,
        order_id: jr2.order_id,
        booking_reference: jr2.booking_reference,
      });
    } catch (e: any) {
      toast.error(e.message || "Card payment failed — try Stripe fallback");
    } finally {
      setBooking(false);
    }
  };

  if (initErr) {
    return (
      <Card className="p-4 border-destructive/30 bg-destructive/5 space-y-3">
        <div className="text-sm text-destructive">Card checkout unavailable: {initErr}</div>
        <Button variant="outline" size="sm" onClick={onFallbackToStripe}>Use Stripe checkout instead</Button>
      </Card>
    );
  }

  if (!clientKey) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Preparing secure card form…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        Card entered here is tokenised by Duffel — never touches our servers.
      </div>
      <DuffelPayments
        clientKey={clientKey}
        paymentIntentClientToken={clientKey}
        onSuccessfulPayment={bookWithCard}
        onFailedPayment={(e: any) => toast.error("Card failed: " + (e?.message || "unknown"))}
        successPaymentRedirectURL={null}
      />
      {booking && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Placing your booking with the airline…
        </div>
      )}
      <div className="text-xs text-muted-foreground">
        Prefer to pay on Stripe?{" "}
        <button className="underline" onClick={onFallbackToStripe} type="button">
          Switch to Stripe checkout
        </button>
      </div>
    </div>
  );
}
