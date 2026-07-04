export type ReasonerMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ReasonerOptions = {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
  timeoutMs?: number;
};

export type ReasonerResult = {
  ok: boolean;
  provider: "azure-openai" | "openai" | "none";
  text: string;
  error?: string;
};

function cleanEndpoint(v: string): string {
  return v.replace(/\/+$/, "");
}

function env(name: string): string | null {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : null;
}

export function hasReasonerConfig(): boolean {
  return Boolean(
    (env("AZURE_OPENAI_ENDPOINT") && env("AZURE_OPENAI_API_KEY") && env("AZURE_OPENAI_DEPLOYMENT")) ||
      env("OPENAI_API_KEY"),
  );
}

export async function callReasoner(
  messages: ReasonerMessage[],
  options: ReasonerOptions = {},
): Promise<ReasonerResult> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const temperature = options.temperature ?? 0.1;
  const maxTokens = options.maxTokens ?? 700;
  const responseFormat = options.responseFormat === "json" ? { type: "json_object" } : undefined;

  const azureEndpoint = env("AZURE_OPENAI_ENDPOINT");
  const azureKey = env("AZURE_OPENAI_API_KEY");
  const azureDeployment = env("AZURE_OPENAI_DEPLOYMENT");
  const azureApiVersion = env("AZURE_OPENAI_API_VERSION") ?? "2025-01-01-preview";

  if (azureEndpoint && azureKey && azureDeployment) {
    try {
      const r = await fetch(
        `${cleanEndpoint(azureEndpoint)}/openai/deployments/${encodeURIComponent(azureDeployment)}/chat/completions?api-version=${encodeURIComponent(azureApiVersion)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "api-key": azureKey },
          body: JSON.stringify({ messages, temperature, max_tokens: maxTokens, response_format: responseFormat }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, provider: "azure-openai", text: "", error: String(j?.error?.message ?? `azure_http_${r.status}`) };
      return { ok: true, provider: "azure-openai", text: String(j?.choices?.[0]?.message?.content ?? "") };
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      return { ok: false, provider: "azure-openai", text: "", error: msg.includes("aborted") ? "azure_timeout" : msg };
    }
  }

  const openaiKey = env("OPENAI_API_KEY");
  const openaiModel = env("OPENAI_MODEL") ?? "gpt-4.1-mini";
  if (openaiKey) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: openaiModel, messages, temperature, max_tokens: maxTokens, response_format: responseFormat }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, provider: "openai", text: "", error: String(j?.error?.message ?? `openai_http_${r.status}`) };
      return { ok: true, provider: "openai", text: String(j?.choices?.[0]?.message?.content ?? "") };
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      return { ok: false, provider: "openai", text: "", error: msg.includes("aborted") ? "openai_timeout" : msg };
    }
  }

  return { ok: false, provider: "none", text: "", error: "reasoner_not_configured" };
}

export async function callReasonerJson(
  messages: ReasonerMessage[],
  options: ReasonerOptions = {},
): Promise<Record<string, unknown>> {
  const result = await callReasoner(messages, { ...options, responseFormat: "json" });
  if (!result.ok) throw new Error(result.error || "reasoner_failed");
  return parseJsonObject(result.text);
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const txt = String(raw ?? "").trim();
  if (!txt) return {};
  try {
    const parsed = JSON.parse(txt);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { /* continue */ }
  const fenced = txt.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { /* continue */ }
  }
  const first = txt.indexOf("{");
  const last = txt.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(txt.slice(first, last + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { /* continue */ }
  }
  return {};
}
