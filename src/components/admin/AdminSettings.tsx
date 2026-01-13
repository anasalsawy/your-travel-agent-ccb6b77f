import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, Bitcoin, DollarSign, Mail, Send, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sendTestEmail } from "@/lib/notifications";
import { AdminQuickCall } from "./AdminQuickCall";

export function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const { toast } = useToast();

  const [settings, setSettings] = useState({
    btc_address: "",
    btc_rate: "",
    zelle_email: "",
    enable_split_payments: false,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .in("key", ["btc_address", "btc_rate", "zelle_email", "enable_split_payments"]);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else if (data) {
        const btcAddress = data.find(s => s.key === "btc_address")?.value || "";
        const btcRate = data.find(s => s.key === "btc_rate")?.value || "";
        const zelleEmail = data.find(s => s.key === "zelle_email")?.value || "";
        const splitPayments = data.find(s => s.key === "enable_split_payments")?.value === "true";
        
        setSettings({
          btc_address: btcAddress,
          btc_rate: btcRate,
          zelle_email: zelleEmail,
          enable_split_payments: splitPayments,
        });
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);

    try {
      const settingsToSave = {
        btc_address: settings.btc_address,
        btc_rate: settings.btc_rate,
        zelle_email: settings.zelle_email,
        enable_split_payments: settings.enable_split_payments ? "true" : "false",
      };

      for (const [key, value] of Object.entries(settingsToSave)) {
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

  const handleSendTestEmail = async () => {
    setSendingTestEmail(true);
    
    try {
      const result = await sendTestEmail();
      
      if (result.success) {
        toast({ 
          title: "Test Email Sent!", 
          description: "Check your admin email inbox (and spam folder) for the test email." 
        });
      } else {
        toast({ 
          title: "Failed to Send Test Email", 
          description: result.error || "Unknown error occurred",
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to send test email",
        variant: "destructive" 
      });
    } finally {
      setSendingTestEmail(false);
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
      {/* Quick Call - Maya */}
      <AdminQuickCall />

      {/* Split Payments Feature Flag */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Split Payments</h2>
            <p className="text-sm text-muted-foreground">Allow customers to pay ticket requests in installments</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
            <div className="space-y-1">
              <Label htmlFor="split-payments" className="font-medium">Enable Split Payments</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, customers can choose to pay 50% deposit now and the remaining balance 3 days before departure.
              </p>
            </div>
            <Switch
              id="split-payments"
              checked={settings.enable_split_payments}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enable_split_payments: checked }))}
            />
          </div>
          
          {settings.enable_split_payments && (
            <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
              <p className="text-sm text-accent font-medium mb-2">✓ Split Payments Active</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Customers see "Pay in Full" or "Pay Deposit (50%)" options</li>
                <li>• Deposit payment triggers admin review</li>
                <li>• After deposit approval, ticket can be issued with balance due</li>
                <li>• Balance due date is set to 3 days before departure</li>
                <li>• Separate email notifications for deposit and balance payments</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Email Notifications */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Email Notifications</h2>
            <p className="text-sm text-muted-foreground">Test your email notification system</p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Click the button below to send a test email to the admin email address. 
            This verifies that your email notifications are working correctly.
          </p>
          
          <Button 
            onClick={handleSendTestEmail} 
            disabled={sendingTestEmail}
            className="gap-2"
          >
            {sendingTestEmail ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send Test Email
          </Button>
        </div>
      </div>

      {/* Bitcoin Settings */}
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

      {/* Zelle Settings */}
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
