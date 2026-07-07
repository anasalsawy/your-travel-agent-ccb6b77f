export type WorkerExecutionInput = {
  agentName: string;
  directive: string;
  missionId: string;
  taskId: string;
};

export type WorkerExecutionOutput = {
  ok: boolean;
  text: string;
  error?: string;
};

export interface FoundryClient {
  runWorker(input: WorkerExecutionInput): Promise<WorkerExecutionOutput>;
}

export class AzureFoundryHttpClient implements FoundryClient {
  constructor(
    private readonly endpoint: string,
    private readonly bearerTokenProvider: () => Promise<string>,
    private readonly runPath = "/threads/runs",
  ) {}

  async runWorker(input: WorkerExecutionInput): Promise<WorkerExecutionOutput> {
    if (!this.endpoint) {
      return { ok: false, text: "", error: "AZURE_AI_PROJECT_ENDPOINT missing" };
    }

    const token = await this.bearerTokenProvider();
    const res = await fetch(this.endpoint.replace(/\/$/, "") + this.runPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agentName: input.agentName,
        message: input.directive,
        metadata: {
          missionId: input.missionId,
          taskId: input.taskId,
        },
      }),
    }).catch((e) => {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `network_error:${String(e)}`,
        }),
        { status: 599 },
      );
    });

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, text: "", error: `http_${res.status}:${text.slice(0, 280)}` };
    }
    return { ok: true, text: text.slice(0, 6000) };
  }
}

export async function fakeTokenProvider(): Promise<string> {
  return "dev-token";
}

export function createAzureClientCredentialTokenProvider(opts: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}): () => Promise<string> {
  let cachedToken = "";
  let cachedExpiry = 0;

  return async () => {
    const now = Date.now();
    if (cachedToken && now < cachedExpiry - 60_000) {
      return cachedToken;
    }

    const scope = opts.scope ?? "https://ai.azure.com/.default";
    const tokenUrl = `https://login.microsoftonline.com/${opts.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      scope,
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      throw new Error(`aad_token_error:${res.status}:${JSON.stringify(data).slice(0, 500)}`);
    }

    const accessToken = String((data as { access_token?: unknown }).access_token ?? "");
    const expiresIn = Number((data as { expires_in?: unknown }).expires_in ?? 3600);
    if (!accessToken) throw new Error("aad_token_missing_access_token");

    cachedToken = accessToken;
    cachedExpiry = now + expiresIn * 1000;
    return cachedToken;
  };
}

export function createManagedIdentityTokenProvider(scope = "https://ai.azure.com/.default"): () => Promise<string> {
  let cachedToken = "";
  let cachedExpiry = 0;

  return async () => {
    const now = Date.now();
    if (cachedToken && now < cachedExpiry - 60_000) return cachedToken;

    const identityEndpoint = process.env.IDENTITY_ENDPOINT;
    const identityHeader = process.env.IDENTITY_HEADER;

    if (!identityEndpoint || !identityHeader) {
      throw new Error("managed_identity_env_missing");
    }

    const url = new URL(identityEndpoint);
    url.searchParams.set("resource", "https://ai.azure.com");
    url.searchParams.set("api-version", "2019-08-01");

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-IDENTITY-HEADER": identityHeader,
        Metadata: "true",
      },
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      throw new Error(`managed_identity_token_error:${res.status}:${JSON.stringify(data).slice(0, 400)}`);
    }

    const accessToken = String((data as { access_token?: unknown }).access_token ?? "");
    const expiresOn = Number((data as { expires_on?: unknown }).expires_on ?? 0);
    if (!accessToken) throw new Error("managed_identity_missing_access_token");

    cachedToken = accessToken;
    cachedExpiry = expiresOn > 0 ? expiresOn * 1000 : now + 50 * 60 * 1000;
    return cachedToken;
  };
}
