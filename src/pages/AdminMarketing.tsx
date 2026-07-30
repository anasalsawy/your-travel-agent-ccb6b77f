import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Megaphone, Globe, Rocket, RefreshCw, Gauge } from "lucide-react";

type Creative = { id: string; angle: string; headline: string; primary_text: string; description: string | null; cta: string; status: string };
type Campaign = {
  id: string; name: string; status: string; autonomy: string; daily_budget_usd: number;
  lifetime_cap_usd: number; spend_usd: number; landing_path: string; kpi: Record<string, number>;
  ao_creatives?: Creative[];
};
type SiteTask = { id: string; kind: string; title: string; detail: string | null; target_path: string | null; priority: number; status: string };
type MetaStatus = { configured: boolean; has_token: boolean; has_ad_account: boolean; has_page: boolean };

const statusTone = (s: string) =>
  s === "live" ? "default" : s === "paused" ? "secondary" : s === "pending_credentials" ? "destructive" : "outline";

export default function AdminMarketing() {
  const [meta, setMeta] = useState<MetaStatus | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tasks, setTasks] = useState<SiteTask[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [brief, setBrief] = useState(
    "Name Your Own Price flights — the traveller names the price they want to pay, our agents hunt the fare and book it. Target US travellers planning complex or multi-city trips.",
  );
  const [budget, setBudget] = useState("20");
  const [cap, setCap] = useState("300");

  const call = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const { data, error } = await supabase.functions.invoke("marketing-os", { body });
      if (error) throw error;
      if (data?.dry_run) toast.warning(data.message ?? "Dry run — Meta credentials missing");
      else if (data?.ok === false) toast.error(data.error ?? "Failed");
      else toast.success(label + " complete");
      return data;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const refresh = async () => {
    const { data } = await supabase.functions.invoke("marketing-os", { body: { action: "status" } });
    if (data?.ok) { setMeta(data.meta); setCampaigns(data.campaigns ?? []); setTasks(data.site_tasks ?? []); }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Growth &amp; Website Operations</h1>
            <p className="text-muted-foreground">The council runs the site and the Facebook page as one operator.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={meta?.configured ? "default" : "destructive"}>
              {meta?.configured ? "Meta connected" : "Meta credentials missing"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </header>

        {meta && !meta.configured && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Campaigns and ad copy are written and stored, but nothing can be pushed to Facebook until a Meta
              system-user token, ad account ID and page ID are saved. Missing:{" "}
              <span className="font-mono">
                {[!meta.has_token && "META_ACCESS_TOKEN", !meta.has_ad_account && "META_AD_ACCOUNT_ID", !meta.has_page && "META_PAGE_ID"].filter(Boolean).join(", ")}
              </span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> New campaign</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} />
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-muted-foreground">Daily $</label>
              <Input className="w-24" value={budget} onChange={(e) => setBudget(e.target.value)} />
              <label className="text-sm text-muted-foreground">Lifetime cap $</label>
              <Input className="w-24" value={cap} onChange={(e) => setCap(e.target.value)} />
              <Button
                disabled={busy !== null}
                onClick={() => void call({ action: "plan", brief, daily_budget_usd: Number(budget), lifetime_cap_usd: Number(cap) }, "Plan")}
              >
                {busy === "Plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
                Write campaign
              </Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => void call({ action: "tick" }, "Heartbeat")}>
                <Gauge className="mr-2 h-4 w-4" /> Run heartbeat
              </Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => void call({ action: "site_audit" }, "Site audit")}>
                <Globe className="mr-2 h-4 w-4" /> Audit website
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {campaigns.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="text-lg">{c.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    ${Number(c.daily_budget_usd).toFixed(0)}/day · spent ${Number(c.spend_usd).toFixed(2)} of ${Number(c.lifetime_cap_usd).toFixed(0)} cap · {c.landing_path}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusTone(c.status)}>{c.status}</Badge>
                  <Badge variant="outline">{c.autonomy}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  {(c.ao_creatives ?? []).map((cr) => (
                    <div key={cr.id} className="rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{cr.angle}</p>
                      <p className="mt-1 font-semibold">{cr.headline}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{cr.primary_text}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{cr.cta}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy !== null} onClick={() => void call({ action: "launch", campaign_id: c.id, force: true }, "Launch")}>
                    <Rocket className="mr-2 h-4 w-4" /> Launch on Facebook
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void call({ action: "page_post", campaign_id: c.id }, "Page post")}>
                    Post to Page (free)
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Website work queue</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {tasks.length === 0 && <p className="text-sm text-muted-foreground">No proposals yet — run an audit.</p>}
            {tasks.map((t) => (
              <div key={t.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{t.title}</p>
                  <div className="flex gap-2">
                    <Badge variant="outline">{t.kind}</Badge>
                    <Badge variant="secondary">P{t.priority}</Badge>
                  </div>
                </div>
                {t.detail && <p className="mt-1 text-sm text-muted-foreground">{t.detail}</p>}
                {t.target_path && <p className="mt-1 font-mono text-xs text-muted-foreground">{t.target_path}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
