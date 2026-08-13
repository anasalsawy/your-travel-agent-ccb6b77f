// Facebook channel driver — runs on the persistent browser profile.
// Uses mbasic.facebook.com because it is form-based HTML: far more stable to
// drive than the React messenger, and cheap to keep working for years.
import { Cdp, withBrowser, createContext, createSession, liveViewUrl, browserAvailable } from "./cdp.ts";

export { browserAvailable, createContext, createSession, liveViewUrl };

const MB = "https://mbasic.facebook.com";

export async function isLoggedIn(cdp: Cdp): Promise<boolean> {
  await cdp.goto(MB + "/messages", 3000);
  const url = await cdp.url();
  if (/login|checkpoint/i.test(url)) return false;
  return await cdp.eval<boolean>(
    "return !!document.querySelector('a[href*=\"/messages\"], form[action*=\"/search\"]') && !/login/i.test(location.href);",
  );
}

export type Thread = { id: string; name: string; preview: string; href: string };

export async function listThreads(cdp: Cdp, limit = 25): Promise<Thread[]> {
  await cdp.goto(MB + "/messages", 3500);
  return await cdp.eval<Thread[]>(`
    const out = [];
    const links = Array.from(document.querySelectorAll('a[href*="/messages/read/"]'));
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/tid=([^&]+)/);
      if (!m) continue;
      const row = a.closest('table, div') || a;
      const txt = (row.innerText || '').trim().replace(/\\s+/g, ' ');
      out.push({ id: decodeURIComponent(m[1]), name: (a.innerText||'').trim().split('\\n')[0] || 'unknown',
                 preview: txt.slice(0, 240), href: href.startsWith('http') ? href : '${MB}' + href });
      if (out.length >= ${limit}) break;
    }
    return out;
  `);
}

export type ThreadMessage = { who: string; body: string };

export async function readThread(cdp: Cdp, threadId: string, limit = 20): Promise<ThreadMessage[]> {
  await cdp.goto(`${MB}/messages/read/?tid=${encodeURIComponent(threadId)}`, 3500);
  const msgs = await cdp.eval<ThreadMessage[]>(`
    const nodes = Array.from(document.querySelectorAll('div[id^="mid."], div[data-sigil*="message"]'));
    const out = nodes.map(n => {
      const t = (n.innerText || '').trim().replace(/\\s+/g, ' ');
      const h = (n.querySelector('h3, strong')?.innerText || '').trim();
      return { who: h || 'them', body: t };
    }).filter(m => m.body);
    return out.slice(-${limit});
  `);
  return msgs ?? [];
}

export async function sendMessage(cdp: Cdp, threadId: string, body: string): Promise<{ ok: boolean; evidence: string }> {
  await cdp.goto(`${MB}/messages/read/?tid=${encodeURIComponent(threadId)}`, 3500);
  const payload = JSON.stringify(body);
  const ok = await cdp.eval<boolean>(`
    const ta = document.querySelector('textarea[name="body"]');
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${payload});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const form = ta.closest('form');
    if (!form) return false;
    const btn = form.querySelector('input[type="submit"], button[type="submit"], [name="send"]');
    if (btn) { btn.click(); } else { form.submit(); }
    return true;
  `);
  await new Promise((r) => setTimeout(r, 3000));
  const evidence = (await cdp.text(1200)) ?? "";
  return { ok: Boolean(ok), evidence };
}

/** High-level helper: open the persisted profile and act on a thread. */
export async function fbDo<T>(contextId: string, fn: (cdp: Cdp) => Promise<T>): Promise<T> {
  return await withBrowser(contextId, fn);
}

// ── Prospecting ────────────────────────────────────────────────────────────
// mbasic search is plain HTML, so post discovery is a DOM read rather than an
// API contract that can be revoked. If Meta ever ships a usable Graph search,
// swap the body of these two functions and nothing upstream changes.
export type FoundPost = { text: string; permalink: string; author: string; profile: string };

export async function searchPosts(cdp: Cdp, query: string, limit = 8): Promise<FoundPost[]> {
  await cdp.goto(MB + "/search/posts/?q=" + encodeURIComponent(query), 5000);
  const out = await cdp.eval<FoundPost[]>(`
    const seen = new Set(); const res = [];
    const blocks = Array.from(document.querySelectorAll('div[role="article"], article, #BrowseResultsContainer > div'));
    for (const b of blocks) {
      const text = (b.innerText || '').trim().replace(/\\s+/g, ' ');
      if (text.length < 30) continue;
      const link = b.querySelector('a[href*="story.php"], a[href*="/posts/"], a[href*="permalink"]');
      const who = b.querySelector('h3 a, strong a, a[href^="/profile.php"], a[href^="/"]');
      const permalink = link ? link.getAttribute('href') : '';
      if (!permalink || seen.has(permalink)) continue;
      seen.add(permalink);
      res.push({
        text: text.slice(0, 600),
        permalink: permalink.startsWith('http') ? permalink : '${MB}' + permalink,
        author: (who && who.innerText || '').trim().slice(0, 80),
        profile: who ? (who.getAttribute('href') || '') : ''
      });
      if (res.length >= ${limit}) break;
    }
    return res;
  `);
  return out ?? [];
}

/** Comment publicly on a post (mbasic exposes a plain comment form). */
export async function commentOnPost(cdp: Cdp, permalink: string, body: string): Promise<{ ok: boolean; evidence: string }> {
  await cdp.goto(permalink, 4000);
  const payload = JSON.stringify(body);
  const ok = await cdp.eval<boolean>(`
    const ta = document.querySelector('textarea[name="comment_text"], textarea[name="comment"]');
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${payload});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const form = ta.closest('form');
    if (!form) return false;
    const btn = form.querySelector('input[type="submit"], button[type="submit"]');
    if (btn) btn.click(); else form.submit();
    return true;
  `);
  await new Promise((r) => setTimeout(r, 2500));
  return { ok: Boolean(ok), evidence: ((await cdp.text(900)) ?? "").slice(0, 900) };
}
