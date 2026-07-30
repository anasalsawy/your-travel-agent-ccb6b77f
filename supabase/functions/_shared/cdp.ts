// Minimal Chrome DevTools Protocol driver.
// Deliberately dependency-free: any remote browser that speaks CDP over a
// websocket works here (Browserbase today, a self-hosted Chrome tomorrow).
// This is the "replaceable tool" rule from the tool-architecture EDR applied
// to the browser capability.

export type CdpSession = { ws: WebSocket; sessionId: string };

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export class Cdp {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, Pending>();
  private pageSession = "";

  static async connect(wsUrl: string, timeoutMs = 20000): Promise<Cdp> {
    const c = new Cdp();
    c.ws = new WebSocket(wsUrl);
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("cdp_connect_timeout")), timeoutMs);
      c.ws.onopen = () => { clearTimeout(t); res(); };
      c.ws.onerror = () => { clearTimeout(t); rej(new Error("cdp_connect_error")); };
    });
    c.ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.id && c.pending.has(msg.id)) {
        const p = c.pending.get(msg.id)!;
        c.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message ?? "cdp_error"));
        else p.resolve(msg.result);
      }
    };
    await c.attachToPage();
    return c;
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 30000): Promise<any> {
    const id = ++this.id;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`cdp_timeout:${method}`)); }
      }, timeoutMs);
    });
  }

  private async attachToPage() {
    const { targetInfos } = await this.send("Target.getTargets");
    let page = (targetInfos ?? []).find((t: any) => t.type === "page");
    if (!page) {
      const created = await this.send("Target.createTarget", { url: "about:blank" });
      page = { targetId: created.targetId };
    }
    const { sessionId } = await this.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
    this.pageSession = sessionId;
    await this.send("Page.enable", {}, sessionId).catch(() => {});
    await this.send("Runtime.enable", {}, sessionId).catch(() => {});
  }

  async goto(url: string, settleMs = 3500) {
    await this.send("Page.navigate", { url }, this.pageSession);
    await new Promise((r) => setTimeout(r, settleMs));
  }

  /** Evaluate JS in the page and return the JSON-serialisable result. */
  async eval<T = unknown>(expression: string, awaitPromise = true): Promise<T> {
    const r = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${expression} })()`,
      awaitPromise,
      returnByValue: true,
    }, this.pageSession);
    if (r?.exceptionDetails) throw new Error("page_eval_error: " + (r.exceptionDetails.text ?? "unknown"));
    return r?.result?.value as T;
  }

  async url(): Promise<string> { return await this.eval<string>("return location.href;"); }
  async text(max = 4000): Promise<string> {
    const t = await this.eval<string>("return document.body ? document.body.innerText : '';");
    return (t ?? "").slice(0, max);
  }

  close() { try { this.ws.close(); } catch { /* noop */ } }
}

// ── Browserbase transport (swap this file's provider block to change vendor) ──
const BB_KEY = Deno.env.get("BROWSERBASE_API_KEY") ?? "";
const BB_PROJECT = Deno.env.get("BROWSERBASE_PROJECT_ID") ?? "";
const BB = "https://api.browserbase.com/v1";

export function browserAvailable() { return Boolean(BB_KEY && BB_PROJECT); }

async function bb(path: string, init: RequestInit = {}) {
  const r = await fetch(BB + path, {
    ...init,
    headers: { "X-BB-API-Key": BB_KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  if (!r.ok) throw new Error(`browserbase ${r.status}: ${String(text).slice(0, 400)}`);
  return body;
}

/** A persisted browser profile — cookies/localStorage survive between sessions. */
export async function createContext(): Promise<string> {
  const c = await bb("/contexts", { method: "POST", body: JSON.stringify({ projectId: BB_PROJECT }) });
  return c.id;
}

export async function createSession(contextId: string, keepAlive = false): Promise<{ id: string; connectUrl: string }> {
  const s = await bb("/sessions", {
    method: "POST",
    body: JSON.stringify({
      projectId: BB_PROJECT,
      keepAlive,
      browserSettings: { context: { id: contextId, persist: true }, solveCaptchas: true },
    }),
  });
  return { id: s.id, connectUrl: s.connectUrl };
}

export async function liveViewUrl(sessionId: string): Promise<string | null> {
  try {
    const d = await bb(`/sessions/${sessionId}/debug`);
    return d.debuggerFullscreenUrl ?? d.debuggerUrl ?? null;
  } catch { return null; }
}

export async function releaseSession(sessionId: string) {
  try {
    await bb(`/sessions/${sessionId}`, {
      method: "POST",
      body: JSON.stringify({ projectId: BB_PROJECT, status: "REQUEST_RELEASE" }),
    });
  } catch { /* best effort */ }
}

/** Open a driven browser on the persisted profile, run fn, always clean up. */
export async function withBrowser<T>(contextId: string, fn: (cdp: Cdp) => Promise<T>): Promise<T> {
  const session = await createSession(contextId, false);
  const cdp = await Cdp.connect(session.connectUrl);
  try {
    return await fn(cdp);
  } finally {
    cdp.close();
    await releaseSession(session.id);
  }
}
