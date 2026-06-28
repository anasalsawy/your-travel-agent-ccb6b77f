import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DuffelPayments as DuffelPaymentsRaw } from "@duffel/components";
const DuffelPayments = DuffelPaymentsRaw as unknown as React.ComponentType<any>;
import { useNavigate } from "react-router-dom";

type SavedCard = {
  id: string;
  label: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  is_test: boolean;
  duffel_card_id: string;
};

export default function AdminDuffelCard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [clientKey, setClientKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth?redirect=/admin/duffel-card"); return; }
      const { data: role } = await supabase.from("user_roles")
        .select("role").eq("user_id", session.user.id).eq("role", "admin").maybeSingle();
      if (!role) { navigate("/dashboard"); return; }
      await refresh();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    const { data } = await supabase.from("admin_duffel_cards").select("*").order("created_at", { ascending: false });
    setCards((data as SavedCard[]) || []);
  };

  const startAddCard = async () => {
    if (!label.trim()) { toast.error("Give the card a label first"); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`https://wpwdxtyufpewdyffxlgo.supabase.co/functions/v1/duffel-client-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
        "x-duffel-mode": mode,
      },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Failed to mint client key"); return; }
    setClientKey(json.client_key);
    setShowForm(true);
  };

  const onCardSaved = async (card: any) => {
    // card.id is the Duffel tcd_... reference
    setSubmitting(true);
    try {
      const { error } = await supabase.from("admin_duffel_cards").insert({
        label: label.trim(),
        duffel_card_id: card.id,
        brand: card.brand || null,
        last4: card.last_4_digits || card.last4 || null,
        exp_month: card.expiry_month || null,
        exp_year: card.expiry_year || null,
        is_test: mode === "test",
      });
      if (error) throw error;
      toast.success("Card saved");
      setLabel(""); setShowForm(false); setClientKey(null);
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to save card");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCard = async (id: string) => {
    if (!confirm("Remove this card?")) return;
    await supabase.from("admin_duffel_cards").delete().eq("id", id);
    await refresh();
  };

  if (loading) {
    return <Layout><div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Duffel Cards</h1>
        <p className="text-muted-foreground mb-6">
          Store cards securely at Duffel and re-use them for server-side bookings.
          Requires Duffel approval for <code>secure_corporate_payment</code> on live mode.
        </p>

        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Add a card</h2>
          {!showForm && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="label">Label</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Chase Sapphire ••4242" />
              </div>
              <div className="flex gap-2">
                <Button variant={mode === "test" ? "default" : "outline"} onClick={() => setMode("test")} size="sm">Test mode</Button>
                <Button variant={mode === "live" ? "default" : "outline"} onClick={() => setMode("live")} size="sm">Live mode</Button>
              </div>
              <Button onClick={startAddCard}>Continue</Button>
              {mode === "test" && (
                <p className="text-xs text-muted-foreground">Use Duffel test card 4242 4242 4242 4242, any future expiry, any CVC.</p>
              )}
            </div>
          )}
          {showForm && clientKey && (
            <div className="space-y-4">
              <DuffelPayments
                clientKey={clientKey}
                paymentIntentClientToken={clientKey}
                onSuccessfulPayment={onCardSaved}
                onFailedPayment={(e: any) => toast.error("Card save failed: " + (e?.message || "unknown"))}
                successPaymentRedirectURL={null}
              />
              <Button variant="outline" onClick={() => { setShowForm(false); setClientKey(null); }} disabled={submitting}>Cancel</Button>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Saved cards</h2>
          {cards.length === 0 && <p className="text-sm text-muted-foreground">No cards yet.</p>}
          <div className="space-y-2">
            {cards.map((c) => (
              <div key={c.id} className="flex items-center justify-between border rounded p-3">
                <div>
                  <div className="font-medium">{c.label} <span className="text-xs text-muted-foreground">({c.is_test ? "test" : "live"})</span></div>
                  <div className="text-sm text-muted-foreground">{c.brand || "card"} •••• {c.last4 || "????"} — exp {c.exp_month}/{c.exp_year}</div>
                  <div className="text-xs font-mono text-muted-foreground">{c.duffel_card_id}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteCard(c.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
