// Azure REST proxy: authenticates via Service Principal (client credentials)
// and forwards signed requests to Azure Management API / Graph / AI Foundry.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const SUBSCRIPTION = Deno.env.get("AZURE_SUBSCRIPTION_ID")!;

// simple in-memory token cache per resource
const tokenCache: Record<string, { token: string; exp: number }> = {};

async function getToken(resource: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache[resource];
  if (cached && cached.exp - 60 > now) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: resource.endsWith("/.default") ? resource : resource + "/.default",
  });

  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error("token error: " + JSON.stringify(j));
  tokenCache[resource] = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

// Resolve resource base for a target URL
function resourceFor(url: string): string {
  if (url.includes("graph.microsoft.com")) return "https://graph.microsoft.com";
  if (url.includes("services.ai.azure.com") || url.includes("ai.azure.com"))
    return "https://ai.azure.com";
  if (url.includes("cognitiveservices.azure.com") || url.includes("openai.azure.com"))
    return "https://cognitiveservices.azure.com";
  return "https://management.azure.com";
}

const AI_PROJECT = Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // auth: require admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", claimsData.claims.sub)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      method = "GET",
      path,           // e.g. "/subscriptions/{sub}/resourceGroups?api-version=2021-04-01"
      url,            // OR full URL (overrides path)
      body: reqBody,
      apiVersion,     // optional override for management default
      service,        // "management" (default) | "ai" (Azure AI Foundry project)
    } = body ?? {};

    let target: string;
    if (url) {
      target = url;
    } else if (path) {
      let p: string = path.startsWith("/") ? path : "/" + path;
      p = p.replace("{subscriptionId}", SUBSCRIPTION).replace("{sub}", SUBSCRIPTION);
      if (service === "ai") {
        if (!AI_PROJECT) {
          return new Response(JSON.stringify({ error: "AZURE_AI_PROJECT_ENDPOINT not configured" }), {
            status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }
        target = AI_PROJECT.replace(/\/$/, "") + p;
        if (!target.includes("api-version=")) {
          target += (target.includes("?") ? "&" : "?") + "api-version=" + (apiVersion ?? "v1");
        }
      } else {
        target = "https://management.azure.com" + p;
        if (apiVersion && !target.includes("api-version=")) {
          target += (target.includes("?") ? "&" : "?") + "api-version=" + apiVersion;
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "path or url required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const token = await getToken(resourceFor(target));
    const azResp = await fetch(target, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: reqBody ? JSON.stringify(reqBody) : undefined,
    });

    const text = await azResp.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    return new Response(
      JSON.stringify({ status: azResp.status, ok: azResp.ok, data: parsed, url: target }),
      { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
