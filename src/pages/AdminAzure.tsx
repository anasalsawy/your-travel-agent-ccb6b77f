import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Cloud, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Preset = {
  label: string;
  method: string;
  path: string;
  body?: string;
  service?: "management" | "ai";
};

const PRESETS: Preset[] = [
  { label: "List resource groups", method: "GET", path: "/subscriptions/{sub}/resourceGroups?api-version=2021-04-01" },
  { label: "List all resources", method: "GET", path: "/subscriptions/{sub}/resources?api-version=2021-04-01" },
  { label: "List Cognitive Services (AI) accounts", method: "GET", path: "/subscriptions/{sub}/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01" },
  { label: "List locations", method: "GET", path: "/subscriptions/{sub}/locations?api-version=2020-01-01" },
  {
    label: "Create resource group (edit body first)",
    method: "PUT",
    path: "/subscriptions/{sub}/resourceGroups/my-rg?api-version=2021-04-01",
    body: JSON.stringify({ location: "eastus" }, null, 2),
  },
  { label: "— AI Foundry: List agents", method: "GET", path: "/assistants?api-version=v1", service: "ai" },
  {
    label: "— AI Foundry: Create agent",
    method: "POST",
    path: "/assistants?api-version=v1",
    service: "ai",
    body: JSON.stringify({
      model: "gpt-4o-mini",
      name: "Booking Delegate",
      instructions: "You are a booking-ops delegate for Your Travel Agent. Use provided tools to search/book.",
      tools: [],
    }, null, 2),
  },
  {
    label: "— AI Foundry: Update agent (edit path)",
    method: "POST",
    path: "/assistants/asst_XXXX?api-version=v1",
    service: "ai",
    body: JSON.stringify({ instructions: "Updated instructions here" }, null, 2),
  },
  { label: "— AI Foundry: Delete agent (edit path)", method: "DELETE", path: "/assistants/asst_XXXX?api-version=v1", service: "ai" },
  { label: "— AI Foundry: Create thread", method: "POST", path: "/threads?api-version=v1", service: "ai", body: "{}" },
  {
    label: "— AI Foundry: Run agent on thread (edit ids)",
    method: "POST",
    path: "/threads/thread_XXXX/runs?api-version=v1",
    service: "ai",
    body: JSON.stringify({ assistant_id: "asst_XXXX" }, null, 2),
  },
  { label: "— AI Foundry: List thread messages (edit id)", method: "GET", path: "/threads/thread_XXXX/messages?api-version=v1", service: "ai" },
];

export default function AdminAzure() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState(PRESETS[0].path);
  const [body, setBody] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth?redirect=/admin/azure"); return; }
      const { data: role } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", session.user.id).eq("role", "admin").maybeSingle();
      if (!role) { navigate("/dashboard"); return; }
      setAllowed(true);
      setLoading(false);
    })();
  }, [navigate]);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      let parsedBody: unknown = undefined;
      if (body.trim()) {
        try { parsedBody = JSON.parse(body); }
        catch { toast({ title: "Invalid JSON body", variant: "destructive" }); setRunning(false); return; }
      }
      const { data, error } = await supabase.functions.invoke("azure-rest", {
        body: { method, path, body: parsedBody },
      });
      if (error) throw error;
      setResult(data);
      if (!data?.ok) toast({ title: "Azure " + data?.status, description: "See response below" });
    } catch (e: any) {
      setResult({ error: e.message });
      toast({ title: "Request failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const applyPreset = (label: string) => {
    const p = PRESETS.find(x => x.label === label);
    if (!p) return;
    setMethod(p.method);
    setPath(p.path);
    setBody(p.body ?? "");
  };

  if (loading) {
    return <Layout><div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;
  }
  if (!allowed) return null;

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8">
        <div className="container mx-auto px-4 max-w-5xl space-y-6">
          <div className="flex items-center gap-3">
            <Cloud className="w-7 h-7 text-primary" />
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold">Azure <span className="text-gradient">Console</span></h1>
              <p className="text-sm text-muted-foreground">Signed via Service Principal. Calls Azure Management REST API.</p>
            </div>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Request</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">Preset</label>
                <Select onValueChange={applyPreset}>
                  <SelectTrigger><SelectValue placeholder="Pick a preset…" /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map(p => <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["GET","POST","PUT","PATCH","DELETE"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={path} onChange={e => setPath(e.target.value)} placeholder="/subscriptions/{sub}/resourceGroups?api-version=2021-04-01" />
              </div>
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">JSON body (optional)</label>
                <Textarea value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder='{"location":"eastus"}' className="font-mono text-xs" />
              </div>
              <Button onClick={run} disabled={running} className="gap-2">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Send to Azure
              </Button>
              <p className="text-xs text-muted-foreground">
                Tip: <code>{"{sub}"}</code> is replaced with your subscription ID. For Graph or AI Foundry, put the full URL in the path field (e.g. <code>https://graph.microsoft.com/v1.0/…</code>).
              </p>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Response {result.status && <span className={"ml-2 text-xs px-2 py-0.5 rounded " + (result.ok ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>{result.status}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted/30 p-3 rounded overflow-auto max-h-[500px]">{JSON.stringify(result.data ?? result, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
