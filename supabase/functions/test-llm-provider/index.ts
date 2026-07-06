// test-llm-provider — probes an OpenAI-compatible /v1/chat/completions endpoint
// using LITELLM_BASE_URL, LITELLM_API_KEY, HF_MODEL_NAME. Returns raw response.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const base   = (Deno.env.get("LITELLM_BASE_URL") ?? "").trim().replace(/\/$/, "");
  const key    = (Deno.env.get("LITELLM_API_KEY")  ?? "").trim();
  const model  = (Deno.env.get("HF_MODEL_NAME")    ?? "").trim();

  const config = {
    base_url_set: !!base && !base.startsWith("REPLACE_ME"),
    api_key_set:  !!key  && !key.startsWith("REPLACE_ME"),
    model_set:    !!model && !model.startsWith("REPLACE_ME"),
    model,
    base_preview: base ? base.slice(0, 40) + (base.length > 40 ? "…" : "") : null,
  };

  if (!config.base_url_set || !config.api_key_set || !config.model_set) {
    return json({
      ok: false,
      stage: "config",
      error: "One or more secrets still hold the REPLACE_ME placeholder. Update LITELLM_BASE_URL, LITELLM_API_KEY, HF_MODEL_NAME in project secrets.",
      config,
    }, 400);
  }

  let userPrompt = "Say hello in one short sentence.";
  try {
    const body = await req.json();
    if (body?.prompt && typeof body.prompt === "string") userPrompt = body.prompt;
  } catch { /* no body — use default */ }

  const url = base.endsWith("/v1") || base.endsWith("/openai/v1")
    ? base + "/chat/completions"
    : base + "/v1/chat/completions";

  const started = Date.now();
  let status = 0;
  let raw: unknown = null;
  let err: string | null = null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    status = r.status;
    const text = await r.text();
    try { raw = JSON.parse(text); } catch { raw = text; }
    if (!r.ok) err = "HTTP " + status;
  } catch (e) {
    err = (e as Error).message;
  }

  const elapsed_ms = Date.now() - started;
  const content = (raw as any)?.choices?.[0]?.message?.content ?? null;

  return json({
    ok: !err,
    stage: err ? "fetch" : "ok",
    error: err,
    endpoint: url,
    model,
    elapsed_ms,
    status,
    content,
    raw,
    config,
  }, err ? 502 : 200);
});

function json(p: unknown, s = 200) {
  return new Response(JSON.stringify(p, null, 2), {
    status: s,
    headers: { ...cors, "content-type": "application/json" },
  });
}
