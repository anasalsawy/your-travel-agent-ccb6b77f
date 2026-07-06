import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function AdminTestLLMProvider() {
  const [prompt, setPrompt] = useState("Say hello in one short sentence.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-llm-provider", {
        body: { prompt },
      });
      setResult(error ? { ok: false, error: error.message, data } : data);
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const ok = result?.ok === true;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Test LLM Provider</h1>
        <p className="text-sm text-muted-foreground">
          Hits <code>/v1/chat/completions</code> using{" "}
          <code>LITELLM_BASE_URL</code>, <code>LITELLM_API_KEY</code>,{" "}
          <code>HF_MODEL_NAME</code>.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium">Prompt</label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <Button onClick={run} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? "Calling…" : "Run test"}
        </Button>
      </Card>

      {result && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            {ok ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            <span className="font-semibold">
              {ok ? "Success" : "Failed"}
            </span>
            {typeof result.status === "number" && (
              <Badge variant="outline">HTTP {result.status}</Badge>
            )}
            {typeof result.elapsed_ms === "number" && (
              <Badge variant="outline">{result.elapsed_ms} ms</Badge>
            )}
            {result.stage && <Badge variant="secondary">{result.stage}</Badge>}
          </div>

          {result.error && (
            <div className="text-sm text-red-600 whitespace-pre-wrap">
              {result.error}
            </div>
          )}

          {result.content && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">
                Model reply
              </div>
              <div className="p-3 rounded bg-muted whitespace-pre-wrap text-sm">
                {result.content}
              </div>
            </div>
          )}

          {result.config && (
            <div className="text-xs text-muted-foreground">
              base_url_set: {String(result.config.base_url_set)} · api_key_set:{" "}
              {String(result.config.api_key_set)} · model_set:{" "}
              {String(result.config.model_set)} · model:{" "}
              <code>{result.config.model || "—"}</code>
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Raw response
            </summary>
            <pre className="mt-2 p-3 rounded bg-muted text-xs overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </Card>
      )}
    </div>
  );
}
