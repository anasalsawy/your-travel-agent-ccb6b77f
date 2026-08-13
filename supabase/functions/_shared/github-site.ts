// SITE WRITE ACCESS — the dev department's hands.
//
// The council edits this website by committing to the repository through the
// GitHub Contents API under an application token (PAT / GitHub App). No human
// is in the loop and no IDE is required. Lovable syncs the repo, so a merged
// commit becomes a deployed change.
//
// Capability-shaped: readFile / writeFile / openBranch / openPullRequest.
// Replace this file to move to GitLab, Gitea, or a raw git push — callers
// only know "apply this change to the site".
const API = "https://api.github.com";
const TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const REPO = Deno.env.get("GITHUB_REPO") ?? ""; // "owner/name"
const BASE_BRANCH = Deno.env.get("GITHUB_BASE_BRANCH") ?? "main";

export function siteWriteConfigured() {
  return Boolean(TOKEN && REPO);
}

async function gh(path: string, init?: RequestInit) {
  const r = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep raw */ }
  if (!r.ok) throw new Error(`github_${r.status}: ${(body?.message ?? String(text)).slice(0, 300)}`);
  return body;
}

const b64encode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

export async function readFile(path: string, ref = BASE_BRANCH) {
  const res = await gh(`/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`);
  return { path, sha: res.sha as string, content: b64decode(res.content ?? "") };
}

export async function listDir(path: string, ref = BASE_BRANCH) {
  const res = await gh(`/repos/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`);
  return (Array.isArray(res) ? res : []).map((f: any) => ({ path: f.path, type: f.type, size: f.size }));
}

export async function openBranch(name: string, from = BASE_BRANCH) {
  const head = await gh(`/repos/${REPO}/git/ref/heads/${encodeURIComponent(from)}`);
  try {
    await gh(`/repos/${REPO}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha: head.object.sha }),
    });
  } catch (e) {
    if (!/already exists/i.test((e as Error).message)) throw e;
  }
  return { branch: name, from_sha: head.object.sha as string };
}

export async function writeFile(opts: {
  path: string; content: string; message: string; branch?: string;
}) {
  const branch = opts.branch ?? BASE_BRANCH;
  let sha: string | undefined;
  try { sha = (await readFile(opts.path, branch)).sha; } catch { /* new file */ }
  const res = await gh(`/repos/${REPO}/contents/${encodeURI(opts.path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: opts.message.slice(0, 200),
      content: b64encode(opts.content),
      branch,
      sha,
    }),
  });
  return { ok: true, path: opts.path, commit: res.commit?.sha ?? null, branch };
}

export async function openPullRequest(opts: { branch: string; title: string; body: string }) {
  const res = await gh(`/repos/${REPO}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: opts.title.slice(0, 200),
      head: opts.branch,
      base: BASE_BRANCH,
      body: opts.body.slice(0, 8000),
    }),
  });
  return { ok: true, number: res.number, url: res.html_url };
}

export async function mergePullRequest(number: number) {
  const res = await gh(`/repos/${REPO}/pulls/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
  return { ok: Boolean(res.merged), sha: res.sha ?? null };
}
