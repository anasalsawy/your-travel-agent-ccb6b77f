import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, Bitcoin, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [settings, setSettings] = useState({
    btc_address: "",
    btc_rate: "",
    zelle_email: "",
  });

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .in("key", ["btc_address", "btc_rate", "zelle_email"]);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else if (data) {
        const btcAddress = data.find(s => s.key === "btc_address")?.value || "";
        const btcRate = data.find(s => s.key === "btc_rate")?.value || "";
        const zelleEmail = data.find(s => s.key === "zelle_email")?.value || "";
        
        setSettings({
          btc_address: btcAddress,
          btc_rate: btcRate,
          zelle_email: zelleEmail,
        });
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);

    try {
      // Update each setting
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase
          .from("site_settings")
          .upsert({ key, value }, { onConflict: "key" });

        if (error) throw error;
      }

      toast({ title: "Success", description: "Settings saved successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
            <Bitcoin className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Bitcoin Settings</h2>
            <p className="text-sm text-muted-foreground">Configure Bitcoin payment options</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="btc_address">Bitcoin Wallet Address</Label>
            <Input
              id="btc_address"
              value={settings.btc_address}
              onChange={(e) => setSettings(prev => ({ ...prev, btc_address: e.target.value }))}
              placeholder="bc1q..."
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="btc_rate">USD to BTC Rate</Label>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground">1 BTC =</span>
              <Input
                id="btc_rate"
                type="number"
                value={settings.btc_rate}
                onChange={(e) => setSettings(prev => ({ ...prev, btc_rate: e.target.value }))}
                placeholder="43500"
                className="max-w-[150px]"
              />
              <span className="text-sm text-muted-foreground">USD</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This rate is used to calculate BTC amounts for customers
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#6D1ED4]/10 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#6D1ED4]" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Zelle Settings</h2>
            <p className="text-sm text-muted-foreground">Configure Zelle payment options</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="zelle_email">Zelle Email Address</Label>
            <Input
              id="zelle_email"
              type="email"
              value={settings.zelle_email}
              onChange={(e) => setSettings(prev => ({ ...prev, zelle_email: e.target.value }))}
              placeholder="your-email@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Customers will send Zelle payments to this email address
            </p>
          </div>
        </div>
      </div>

      <Button variant="hero" size="lg" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Settings
      </Button>
    </div>
  );
}
