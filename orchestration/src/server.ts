import http from "node:http";
import { URL } from "node:url";
import { OrchestratorEngine } from "./engine/orchestrator.js";
import {
  AzureFoundryHttpClient,
  createAzureClientCredentialTokenProvider,
  createManagedIdentityTokenProvider,
  fakeTokenProvider,
} from "./adapters/foundryClient.js";

const port = Number(process.env.PORT ?? 8790);
const host = process.env.HOST ?? "0.0.0.0";

const azureEndpoint = process.env.AZURE_AI_PROJECT_ENDPOINT ?? "";
const tenantId = process.env.AZURE_TENANT_ID ?? "";
const clientId = process.env.AZURE_CLIENT_ID ?? "";
const clientSecret = process.env.AZURE_CLIENT_SECRET ?? "";
const runPath = process.env.AZURE_FOUNDRY_RUN_PATH ?? "/threads/runs";

const tokenProvider = tenantId && clientId && clientSecret
  ? createAzureClientCredentialTokenProvider({ tenantId, clientId, clientSecret })
  : process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER
  ? createManagedIdentityTokenProvider()
  : fakeTokenProvider;

const foundry = new AzureFoundryHttpClient(azureEndpoint, tokenProvider, runPath);
const engine = new OrchestratorEngine(foundry);

function healthPayload() {
  return {
    ok: true,
    service: "yta-orchestrator",
    uptime_sec: Math.round(process.uptime()),
    azure_endpoint_configured: Boolean(azureEndpoint),
    timestamp: new Date().toISOString(),
  };
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function send(res: http.ServerResponse, code: number, payload: unknown): void {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  try {
    if (method === "GET" && path === "/health") {
      return send(res, 200, healthPayload());
    }

    if (method === "POST" && path === "/missions") {
      const body = await readJson(req);
      const objective = String(body.objective ?? "").trim();
      const lead = body.lead ? String(body.lead) : undefined;
      if (objective.length < 4) return send(res, 400, { ok: false, error: "objective_too_short" });
      const mission = engine.createMission(objective, lead);
      return send(res, 200, { ok: true, mission });
    }

    const missionMatch = path.match(/^\/missions\/([^/]+)$/);
    if (method === "GET" && missionMatch) {
      const id = missionMatch[1];
      const data = engine.getMission(id);
      if (!data.mission) return send(res, 404, { ok: false, error: "mission_not_found" });
      return send(res, 200, { ok: true, ...data });
    }

    const tickMatch = path.match(/^\/missions\/([^/]+)\/tick$/);
    if (method === "POST" && tickMatch) {
      const id = tickMatch[1];
      const result = await engine.tick(id);
      return send(res, 200, { ok: true, result });
    }

    const runMatch = path.match(/^\/missions\/([^/]+)\/run$/);
    if (method === "POST" && runMatch) {
      const id = runMatch[1];
      const body = await readJson(req);
      const maxTicks = Number(body.maxTicks ?? 8);
      const results = [];
      for (let i = 0; i < Math.max(1, Math.min(40, maxTicks)); i += 1) {
        const r = await engine.tick(id);
        results.push(r);
        if (["completed", "failed", "escalated"].includes(r.status)) break;
      }
      return send(res, 200, { ok: true, missionId: id, ticks: results.length, results });
    }

    return send(res, 404, { ok: false, error: "not_found" });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e) });
  }
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`[yta-orchestrator] online http://${host}:${port}`);
});
