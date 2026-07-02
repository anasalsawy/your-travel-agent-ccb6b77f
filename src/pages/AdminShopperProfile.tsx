import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Addr = {
  name?: string; line1?: string; line2?: string; city?: string; state?: string;
  postal_code?: string; country?: string; phone?: string; email?: string;
};

type Profile = {
  payment_ref: string | null;
  payment_brand: string | null;
  payment_last4: string | null;
  ship_to: Addr;
  bill_to: Addr;
  budget_daily_cap_usd: number | null;
  notes: string | null;
};

const EMPTY: Profile = {
  payment_ref: "", payment_brand: "", payment_last4: "",
  ship_to: {}, bill_to: {}, budget_daily_cap_usd: 2000, notes: "",
};

const FIELDS: (keyof Addr)[] = ["name","line1","line2","city","state","postal_code","country","phone","email"];

export default function AdminShopperProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [p, setP] = useState<Profile>(EMPTY);
  const [cards, setCards] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth?redirect=/admin/shopper-profile"); return; }
      const { data: role } = await supabase.from("user_roles")
        .select("role").eq("user_id", session.user.id).eq("role", "admin").maybeSingle();
      if (!role) { navigate("/dashboard"); return; }
      const { data } = await supabase.from("shopper_profile").select("*").eq("id", 1).maybeSingle();
      if (data) setP({ ...EMPTY, ...data, ship_to: (data.ship_to as Addr) || {}, bill_to: (data.bill_to as Addr) || {} });
      const { data: c } = await supabase.from("admin_duffel_cards").select("*").order("created_at", { ascending: false });
      setCards(c ?? []);
      setLoading(false);
    })();
  }, [navigate]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("shopper_profile").upsert({ id: 1, ...p, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Standing orders saved");
    // Re-push instructions so agents pick up the new profile immediately.
    await supabase.functions.invoke("azure-agents-v1", { body: { action: "apply-roster" } })
      .then(() => toast.success("Agents re-briefed"))
      .catch((e) => toast.error("apply-roster: " + (e as Error).message));
  };

  if (loading) return <Layout><div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;

  const AddrForm = ({ label, value, onChange }: { label: string; value: Addr; onChange: (v: Addr) => void }) => (
    <div className="space-y-2">
      <h3 className="font-semibold">{label}</h3>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <div key={f}>
            <Label className="text-xs">{f}</Label>
            <Input value={(value[f] as string) ?? ""} onChange={(e) => onChange({ ...value, [f]: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Shopper Standing Orders</h1>
          <p className="text-muted-foreground">Payment, shipping, and billing baked into every shopper agent's system prompt.</p>
        </div>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Payment method</h2>
          <div>
            <Label>Saved card (ref)</Label>
            <select
              className="w-full border rounded p-2 bg-background"
              value={p.payment_ref ?? ""}
              onChange={(e) => {
                const c = cards.find((x) => x.duffel_card_id === e.target.value);
                setP({ ...p, payment_ref: e.target.value || null, payment_brand: c?.brand ?? null, payment_last4: c?.last4 ?? null });
              }}
            >
              <option value="">— none —</option>
              {cards.map((c) => (
                <option key={c.id} value={c.duffel_card_id}>{c.label} ({c.brand} ••{c.last4}) {c.is_test ? "· test" : ""}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Reference only. Agents never see the raw PAN.</p>
          </div>
          <div>
            <Label>Daily budget cap (USD)</Label>
            <Input type="number" value={p.budget_daily_cap_usd ?? 0}
              onChange={(e) => setP({ ...p, budget_daily_cap_usd: Number(e.target.value) })} />
          </div>
        </Card>

        <Card className="p-6"><AddrForm label="Ship to" value={p.ship_to} onChange={(v) => setP({ ...p, ship_to: v })} /></Card>
        <Card className="p-6"><AddrForm label="Bill to (leave blank to reuse Ship to)" value={p.bill_to} onChange={(v) => setP({ ...p, bill_to: v })} /></Card>

        <Card className="p-6 space-y-2">
          <Label>Ops notes to the squad</Label>
          <Textarea rows={3} value={p.notes ?? ""} onChange={(e) => setP({ ...p, notes: e.target.value })} />
        </Card>

        <div className="flex gap-2 justify-end">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save & re-brief agents
          </Button>
        </div>
      </div>
    </Layout>
  );
}
