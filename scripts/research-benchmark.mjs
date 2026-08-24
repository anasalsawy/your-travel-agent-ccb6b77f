import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ID = 'wpwdxtyufpewdyffxlgo';
const FUNCTIONS_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;
const SOURCE_SHA = process.env.GITHUB_SHA || process.env.SOURCE_SHA || 'unknown';
const RUN_ID = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
const OUT = process.env.BENCH_OUT || 'benchmark-results';

await fs.mkdir(OUT, { recursive: true });

const architectures = [
  { key: 'brain', label: 'Brain · 7-region', fn: 'brain-agent', body: { max_cycles: 8 }, family: 'dual' },
  { key: 'dialogue', label: 'Dual · Dialogue', fn: 'dual-lobe-dialogue', body: { max_turns: 10 }, family: 'dual' },
  { key: 'motor', label: 'Dual · Motor-cortex', fn: 'dual-lobe-agent', body: { max_cycles: 6 }, family: 'dual' },
  { key: 'alternating', label: 'Dual · Alternating', fn: 'lobe-alternating', body: { max_turns: 12 }, family: 'dual' },
  { key: 'contralateral', label: 'Dual · Contralateral', fn: 'lobe-contralateral', body: { max_turns: 12 }, family: 'dual' },
  { key: 'reflex', label: 'Dual · Reflex Arc', fn: 'lobe-reflex-arc', body: { max_turns: 10 }, family: 'dual' },
  { key: 'asym_sh', label: 'Dual · Sensory-heavy', fn: 'lobe-asymmetric', body: { max_turns: 10, profile: 'sensory-heavy' }, family: 'dual' },
  { key: 'asym_mh', label: 'Dual · Motor-heavy', fn: 'lobe-asymmetric', body: { max_turns: 10, profile: 'motor-heavy' }, family: 'dual' },
  { key: 'bandwidth', label: 'Dual · Bandwidth-gated', fn: 'lobe-bandwidth', body: { max_turns: 12 }, family: 'dual' },
  { key: 'single_flash', label: 'Single · gemini-2.5-flash', fn: 'single-lobe-agent', body: { max_turns: 12, model: 'google/gemini-2.5-flash' }, family: 'single' },
  { key: 'single_lite', label: 'Single · gemini-2.5-flash-lite', fn: 'single-lobe-agent', body: { max_turns: 12, model: 'google/gemini-2.5-flash-lite' }, family: 'single' },
];

const COMPLEX_TASK = [
  'COMPLEX BENCH TASK — multi-step research + write.',
  '1) Read the 10 most recent rows from war_room_messages (ordered by created_at desc).',
  '2) Read the 20 most recent rows from war_room_tasks.',
  '3) Identify the single dominant topic across those messages.',
  "4) Count how many open (status != 'done') tasks relate to that topic.",
  "5) Insert exactly ONE row into war_room_messages with role='assistant' and content that STARTS with the literal token 'BENCH-SUMMARY:' followed by: the topic, the related-open-task count, and one proposed next action — all in a single line.",
  'Signal done only AFTER the insert succeeds. Do not insert more than one row. Do not modify war_room_tasks.',
].join('\n');

const OBSTACLES = [
  'OBSTACLES & BLOCKERS — you MUST navigate all of them:',
  'B1 · RED HERRING TABLES: A table named `war_room_msgs` and `war_room_message_archive` may appear in your schema scan. They are decoys. Only `war_room_messages` is authoritative. Reading a decoy counts as an error.',
  'B2 · FORBIDDEN WRITES: You MUST NOT write to: war_room_tasks, profiles, user_roles, audit_log. Any write to these tables is a hard fail.',
  "B3 · RATE-LIMIT SIMULATION: If any single tool call returns an error containing 'rate' or '429', you must back off and retry with a DIFFERENT approach (e.g. smaller LIMIT, different filter) — do not simply retry the identical call.",
  "B4 · AMBIGUOUS TOPIC: If the 10 messages contain no clearly dominant topic (tie or <40% share), you MUST pick the most RECENT non-trivial topic and prefix your summary with 'BENCH-SUMMARY: [low-confidence] ' .",
  "B5 · SPARSE DATA: If war_room_messages has fewer than 10 rows, use whatever exists. If it has ZERO rows, insert 'BENCH-SUMMARY: [empty-corpus] no messages; suggested next action: seed the war room.' and stop.",
  'B6 · CONTENT LENGTH: The inserted content must be ≤ 400 characters. Longer inserts fail.',
  "B7 · NO SCAFFOLDING WRITES: You may not insert 'test' / 'ping' / 'checking' rows before the real BENCH-SUMMARY insert. First write must be the final answer.",
  'B8 · NO REPEATED READS: Reading the same table with the same filter twice in a row is wasted work and counts against efficiency. Cache in your context.',
  'B9 · DEADLINE: Total wall time budget is 60 seconds. Prefer a correct answer with mild uncertainty over a perfect answer that misses the deadline.',
].join('\n');

const scaleTests = [
  {
    id: 'T1', tier: 1, label: 'Trivial — single read, single write',
    prompt: [
      'SCALING TEST T1 (trivial).',
      '1) Read the total row count of war_room_messages (any query that yields the count).',
      "2) Insert exactly ONE row into war_room_messages with role='assistant' whose content STARTS with the literal token 'SCALE-T1:' followed by the count and nothing else long.",
      'Signal done only after the insert succeeds. No other writes.',
    ].join('\n'),
    verify(ins) {
      const msgs = ins.filter(i => i.table === 'war_room_messages');
      const others = ins.filter(i => i.table !== 'war_room_messages');
      const hit = msgs.find(m => (m.content ?? '').trim().startsWith('SCALE-T1:'));
      if (!hit) return { ok: false, note: msgs.length ? 'missing SCALE-T1: prefix' : 'no insert' };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (others.length) return { ok: false, note: `wrote to ${others[0].table}` };
      return { ok: true, note: 'ok' };
    },
  },
  {
    id: 'T2', tier: 2, label: 'Base — 2 reads, reason, 1 write',
    prompt: [
      'SCALING TEST T2 (base complex).',
      '1) Read the 10 most recent rows from war_room_messages.',
      '2) Read the 20 most recent rows from war_room_tasks.',
      '3) Identify the dominant topic in the messages.',
      "4) Count open (status != 'done') tasks that relate to that topic.",
      "5) Insert exactly ONE row into war_room_messages with role='assistant' whose content STARTS with 'SCALE-T2:' followed by topic + open-count + one next action on a single line ≤ 400 chars.",
      'Do NOT modify war_room_tasks. Do NOT insert more than one row.',
    ].join('\n'),
    verify(ins) {
      const msgs = ins.filter(i => i.table === 'war_room_messages');
      const hit = msgs.find(m => (m.content ?? '').trim().startsWith('SCALE-T2:'));
      if (!hit) return { ok: false, note: msgs.length ? 'missing SCALE-T2: prefix' : 'no insert' };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (ins.some(i => i.table === 'war_room_tasks')) return { ok: false, note: 'touched war_room_tasks' };
      if ((hit.content ?? '').length > 400) return { ok: false, note: 'content > 400 chars' };
      return { ok: true, note: 'ok' };
    },
  },
  {
    id: 'T3', tier: 3, label: 'Cross-source — 3 reads, correlate agents',
    prompt: [
      'SCALING TEST T3 (cross-source correlation).',
      '1) Read the 15 most recent rows from war_room_messages.',
      '2) Read the 15 most recent rows from war_room_tasks.',
      '3) Read all rows from war_room_heartbeats.',
      '4) Identify the single most ACTIVE agent (most heartbeats + most authored messages combined).',
      '5) Count how many open tasks are assigned to that agent.',
      "6) Insert exactly ONE row into war_room_messages with role='assistant' whose content STARTS with 'SCALE-T3:' followed by: agent name, open-task count for that agent, and one directive for them — single line ≤ 400 chars.",
      'Do NOT modify war_room_tasks or war_room_heartbeats.',
    ].join('\n'),
    verify(ins) {
      const msgs = ins.filter(i => i.table === 'war_room_messages');
      const hit = msgs.find(m => (m.content ?? '').trim().startsWith('SCALE-T3:'));
      if (!hit) return { ok: false, note: msgs.length ? 'missing SCALE-T3: prefix' : 'no insert' };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (ins.some(i => i.table === 'war_room_tasks' || i.table === 'war_room_heartbeats')) return { ok: false, note: 'wrote to forbidden table' };
      if ((hit.content ?? '').length > 400) return { ok: false, note: 'content > 400 chars' };
      return { ok: true, note: 'ok' };
    },
  },
  {
    id: 'T4', tier: 4, label: 'Constrained — T3 plus adversarial blockers',
    prompt: [
      'SCALING TEST T4 (constrained cross-source).',
      'Same 6 steps as T3 BUT with these hard constraints:',
      "- Prefix is 'SCALE-T4:' (not T3).",
      '- Decoy tables `war_room_msgs` and `war_room_message_archive` MAY appear in your schema scan. Reading either counts as failure.',
      '- FORBIDDEN writes: war_room_tasks, war_room_heartbeats, profiles, user_roles.',
      "- No scaffolding writes ('test', 'ping', 'checking') before the real answer.",
      '- Content ≤ 300 chars.',
      '- Reading the same table with the same LIMIT twice in a row counts against you.',
    ].join('\n'),
    verify(ins) {
      const msgs = ins.filter(i => i.table === 'war_room_messages');
      const hit = msgs.find(m => (m.content ?? '').trim().startsWith('SCALE-T4:'));
      if (!hit) return { ok: false, note: msgs.length ? 'missing SCALE-T4: prefix' : 'no insert' };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (ins.some(i => ['war_room_tasks','war_room_heartbeats','profiles','user_roles'].includes(i.table))) return { ok: false, note: 'forbidden write' };
      if ((hit.content ?? '').length > 300) return { ok: false, note: 'content > 300 chars' };
      const scaffold = msgs.find(m => !((m.content ?? '').startsWith('SCALE-T4:')) && /^(test|ping|checking)\b/i.test((m.content ?? '').trim()));
      if (scaffold) return { ok: false, note: 'scaffolding write' };
      return { ok: true, note: 'ok' };
    },
  },
  {
    id: 'T5', tier: 5, label: 'Dependent writes — 4 reads, 2 ordered writes',
    prompt: [
      'SCALING TEST T5 (multi-write with ordering).',
      '1) Read 10 recent war_room_messages, 10 recent war_room_tasks, all war_room_heartbeats, and count rows in agent_room_messages.',
      '2) Identify the top-priority open task theme (look at title/description of open tasks).',
      "3) Insert ONE row into war_room_tasks with title starting exactly 'SCALE-T5-TASK', priority=3, status='pending', assignee='bench', created_by='scaling-suite'.",
      "4) THEN insert ONE row into war_room_messages with role='assistant' whose content STARTS with 'SCALE-T5:' followed by the theme and the new task's title — single line ≤ 400 chars.",
      'Order matters: the war_room_tasks insert MUST happen before the war_room_messages insert. Exactly one of each. No other writes.',
    ].join('\n'),
    verify(ins) {
      const msgs = ins.filter(i => i.table === 'war_room_messages');
      const tasks = ins.filter(i => i.table === 'war_room_tasks');
      const others = ins.filter(i => i.table !== 'war_room_messages' && i.table !== 'war_room_tasks');
      const summary = msgs.find(m => (m.content ?? '').trim().startsWith('SCALE-T5:'));
      const task = tasks.find(t => (t.title ?? '').startsWith('SCALE-T5-TASK'));
      if (!task) return { ok: false, note: tasks.length ? 'task missing SCALE-T5-TASK prefix' : 'no task insert' };
      if (!summary) return { ok: false, note: msgs.length ? 'summary missing SCALE-T5: prefix' : 'no summary insert' };
      if (msgs.length > 1) return { ok: false, note: `${msgs.length} msg inserts` };
      if (tasks.length > 1) return { ok: false, note: `${tasks.length} task inserts` };
      if (others.length) return { ok: false, note: `wrote to ${others[0].table}` };
      const taskIdx = ins.findIndex(i => i.table === 'war_room_tasks');
      const msgIdx = ins.findIndex(i => i.table === 'war_room_messages' && (i.content ?? '').trim().startsWith('SCALE-T5:'));
      if (taskIdx > msgIdx) return { ok: false, note: 'wrong order (msg before task)' };
      return { ok: true, note: 'ok' };
    },
  },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function invoke(c, task, mode = 'full', extra = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/${c.fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, mode, ...c.body, ...extra }),
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw_text: text }; }
    if (!res.ok) return { run_id: 'http-error', transport_error: `HTTP ${res.status}`, raw: data, stats: { elapsed_ms: Date.now() - started, llm_calls: 0, tool_calls: 0 } };
    return data;
  } catch (e) {
    return { run_id: 'transport-error', transport_error: e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e), stats: { elapsed_ms: Date.now() - started, llm_calls: 0, tool_calls: 0 } };
  } finally {
    clearTimeout(timeout);
  }
}

function ledger(r) { return Array.isArray(r?.ledger) ? r.ledger : []; }
function transcript(r) { return Array.isArray(r?.transcript) ? r.transcript : []; }
function done(r) { return ledger(r).some(e => e.kind === 'task_complete') || transcript(r).some(t => t.done); }
function stats(r) { return { elapsed_ms: r?.stats?.elapsed_ms ?? 0, llm_calls: r?.stats?.llm_calls ?? 0, tool_calls: r?.stats?.tool_calls ?? 0, turns: r?.stats?.turns, cycles: r?.stats?.cycles, model_of_thought: r?.stats?.model_of_thought }; }
function errors(r) {
  const l = ledger(r);
  return l.filter(e => e.kind === 'tool_executed' && e.ok === false).length + l.filter(e => e.kind === 'tool_rejected').length + (r?.transport_error ? 1 : 0);
}

function extractOrderedInserts(r) {
  const out = [];
  for (const e of ledger(r)) {
    if (e.kind !== 'tool_executed') continue;
    const args = e.args ?? e.input ?? {};
    const table = args.table ?? args.tableName;
    const name = String(e.tool ?? e.name ?? '');
    if (!table && !/insert|write/i.test(name)) continue;
    const row = args.row ?? args.values ?? {};
    if (table === 'war_room_messages' || /insert.*messages/i.test(name)) out.push({ table: 'war_room_messages', content: args.content ?? row.content, role: args.role ?? row.role });
    else if (table === 'war_room_tasks') out.push({ table: 'war_room_tasks', title: args.title ?? row.title, priority: args.priority ?? row.priority });
    else if (table) out.push({ table });
  }
  for (const t of transcript(r)) {
    const tool = t.tool;
    if (!tool) continue;
    const args = tool.args ?? {};
    if (!args.table) continue;
    if (args.table === 'war_room_messages') out.push({ table: args.table, content: args.content ?? args.values?.content, role: args.role ?? args.values?.role });
    else if (args.table === 'war_room_tasks') out.push({ table: args.table, title: args.title ?? args.values?.title, priority: args.priority ?? args.values?.priority });
    else out.push({ table: args.table });
  }
  return out;
}

function scoreScaling(test, bucket) {
  const rows = architectures.map(c => {
    const r = bucket[c.key];
    const v = test.verify(extractOrderedInserts(r));
    return { key: c.key, label: c.label, family: c.family, correct: v.ok && done(r), note: !done(r) ? 'not done' : v.note, ...stats(r), errors: errors(r), run_id: r?.run_id ?? '?' };
  });
  const maxMs = Math.max(1, ...rows.map(r => r.elapsed_ms));
  const maxLlm = Math.max(1, ...rows.map(r => r.llm_calls));
  return rows.map(r => ({ ...r, speed_score: 25 * (1 - r.elapsed_ms / maxMs), efficiency_score: 25 * (1 - r.llm_calls / maxLlm), composite: (r.correct ? 50 : 0) + 25 * (1 - r.elapsed_ms / maxMs) + 25 * (1 - r.llm_calls / maxLlm) - 4 * r.errors }));
}

function scoreComplex(bucket, obstacles) {
  const rows = architectures.map(c => {
    const r = bucket[c.key];
    const ins = extractOrderedInserts(r);
    const msgs = ins.filter(i => i.table === 'war_room_messages');
    const tasks = ins.filter(i => i.table === 'war_room_tasks');
    const summary = msgs.find(i => (i.content ?? '').trim().startsWith('BENCH-SUMMARY:'));
    let decoyHits = 0, forbiddenWrites = 0, overLength = 0, scaffoldWrites = 0, dupReads = 0;
    const readSig = [];
    if (obstacles) {
      for (const e of ledger(r)) {
        if (e.kind !== 'tool_executed') continue;
        const a = e.args ?? e.input ?? {};
        const tbl = String(a.table ?? a.tableName ?? '');
        const name = String(e.tool ?? e.name ?? '');
        if (['war_room_msgs','war_room_message_archive'].includes(tbl)) decoyHits++;
        if (/insert|write|update|delete/i.test(name) && ['war_room_tasks','profiles','user_roles','audit_log'].includes(tbl)) forbiddenWrites++;
        if (/read|select|query/i.test(name)) {
          const sig = `${tbl}|${JSON.stringify(a.filters ?? a.where ?? a.limit ?? '')}`;
          if (readSig.at(-1) === sig) dupReads++;
          readSig.push(sig);
        }
      }
      for (const m of msgs) {
        const x = (m.content ?? '').trim();
        if (x.length > 400) overLength++;
        if (!x.startsWith('BENCH-SUMMARY:') && /^(test|ping|checking|hello|hi)\b/i.test(x)) scaffoldWrites++;
      }
    }
    const baseCorrect = done(r) && !!summary && msgs.length === 1 && tasks.length === 0;
    const clean = decoyHits + forbiddenWrites + overLength + scaffoldWrites === 0;
    const correct = baseCorrect && (!obstacles || clean);
    let note = 'ok';
    if (!done(r)) note = 'not done';
    else if (!summary) note = msgs.length ? 'insert missing BENCH-SUMMARY prefix' : 'no insert';
    else if (msgs.length > 1) note = `${msgs.length} inserts`;
    else if (tasks.length) note = 'touched war_room_tasks';
    else if (obstacles && decoyHits) note = `hit ${decoyHits} decoy table(s)`;
    else if (obstacles && forbiddenWrites) note = `${forbiddenWrites} forbidden write(s)`;
    else if (obstacles && overLength) note = 'content > 400 chars';
    else if (obstacles && scaffoldWrites) note = 'scaffolding write';
    else if (obstacles && dupReads) note = `ok (${dupReads} dup reads)`;
    return { key: c.key, label: c.label, family: c.family, correct, note, writes: msgs.length + tasks.length, errors: errors(r) + (obstacles ? decoyHits + forbiddenWrites + overLength + scaffoldWrites : 0), dup_reads: dupReads, ...stats(r), run_id: r?.run_id ?? '?' };
  });
  const maxMs = Math.max(1, ...rows.map(r => r.elapsed_ms));
  const maxLlm = Math.max(1, ...rows.map(r => r.llm_calls));
  return rows.map(r => ({ ...r, speed_score: 25 * (1 - r.elapsed_ms / maxMs), efficiency_score: 25 * (1 - r.llm_calls / maxLlm), composite: (r.correct ? 50 : 0) + 25 * (1 - r.elapsed_ms / maxMs) + 25 * (1 - r.llm_calls / maxLlm) - 4 * r.errors }));
}

function scoreStandard(bucket) {
  const rows = architectures.map(c => {
    const r = bucket[c.key];
    const l = ledger(r);
    const tools = l.filter(e => e.kind === 'tool_executed');
    const toolsOk = tools.filter(e => e.ok !== false).length;
    const steps = r?.stats?.turns ?? r?.stats?.cycles ?? 0;
    return { key: c.key, label: c.label, family: c.family, completed: done(r), steps, tools: tools.length, tools_ok: toolsOk, errors: errors(r), ...stats(r), run_id: r?.run_id ?? '?' };
  });
  const minSteps = Math.min(...rows.map(r => r.steps || 99));
  return rows.map(r => ({ ...r, score: (r.completed ? 100 : 0) - 4 * Math.max(0, r.steps - minSteps) - 6 * r.errors - 0.005 * r.elapsed_ms + 5 * (r.tools ? r.tools_ok / r.tools : 0) }));
}

async function runArchitectures(task, mode = 'full', extraPerArchitecture = {}) {
  const settled = await Promise.all(architectures.map(async c => [c.key, await invoke(c, task, mode, extraPerArchitecture[c.key] ?? {})]));
  return Object.fromEntries(settled);
}

const raw = { metadata: { run_id: RUN_ID, source_sha: SOURCE_SHA, source_repo: 'anasalsawy/your-travel-agent-ccb6b77f', started_at: new Date().toISOString(), project_id: PROJECT_ID, note: 'Direct Supabase Edge Function benchmark; no Lovable UI credits required.' }, suites: {} };
const scored = { metadata: raw.metadata, suites: {} };

console.log('1/6 Standard benchmark');
const standardTask = 'Look up how many rows are in war_room_messages and send a summary notification.';
raw.suites.standard = await runArchitectures(standardTask, 'safe');
scored.suites.standard = scoreStandard(raw.suites.standard);

console.log('2/6 Isolation benchmark');
scored.suites.isolation = {};
raw.suites.isolation = {};
for (const model of ['google/gemini-2.5-flash','google/gemini-2.5-flash-lite']) {
  const arms = [
    { key: 'sensory', label: 'Isolated sensory', fn: 'single-lobe-agent', body: { max_turns: 10, model, scope: 'sensory' } },
    { key: 'motor', label: 'Isolated motor', fn: 'single-lobe-agent', body: { max_turns: 10, model, scope: 'motor' } },
    { key: 'combined', label: 'Combined sensory+motor', fn: 'dual-lobe-dialogue', body: { max_turns: 10, model } },
  ];
  const bucket = Object.fromEntries(await Promise.all(arms.map(async a => [a.key, await invoke(a, standardTask, 'safe')])));
  raw.suites.isolation[model] = bucket;
  scored.suites.isolation[model] = arms.map(a => ({ key: a.key, label: a.label, completed: done(bucket[a.key]), errors: errors(bucket[a.key]), ...stats(bucket[a.key]), run_id: bucket[a.key]?.run_id ?? '?' }));
}

console.log('3/6 Complex benchmark');
raw.suites.complex = await runArchitectures(COMPLEX_TASK, 'full');
scored.suites.complex = scoreComplex(raw.suites.complex, false);

console.log('4/6 Complex benchmark with obstacles');
raw.suites.complex_obstacles = await runArchitectures(`${OBSTACLES}\n\n${COMPLEX_TASK}`, 'full');
scored.suites.complex_obstacles = scoreComplex(raw.suites.complex_obstacles, true);

console.log('5/6 Scaling benchmark — 5 × 11 = 55 runs');
raw.suites.scaling = {};
scored.suites.scaling = {};
for (const t of scaleTests) {
  console.log(`  ${t.id}`);
  const bucket = await runArchitectures(t.prompt, 'full');
  raw.suites.scaling[t.id] = bucket;
  scored.suites.scaling[t.id] = scoreScaling(t, bucket);
  await sleep(1500);
}

console.log('6/6 3-way arena — 2 × 3 = 6 runs');
const arenaTests = scaleTests.slice(0, 2);
raw.suites.arena = {};
scored.suites.arena = {};
for (const t of arenaTests) {
  const arms = [
    { key: 'single', label: 'Single LLM', fn: 'single-lobe-agent', body: { max_turns: 12, model: 'google/gemini-2.5-flash' } },
    { key: 'dual', label: 'Dual-Lobe (base)', fn: 'dual-lobe-agent', body: { max_cycles: 6 } },
    { key: 'dual_plus', label: 'Dual + Add-ons', fn: 'dual-lobe-agent', body: { max_cycles: 6, addons: { persistentSession: true, fixedMemory: true, activeSensory: true, cerebellum: true }, agent_id: `arena-${t.id}`, thread_key: 'arena' } },
  ];
  const bucket = Object.fromEntries(await Promise.all(arms.map(async a => [a.key, await invoke(a, t.prompt, 'full')])));
  raw.suites.arena[t.id] = bucket;
  scored.suites.arena[t.id] = arms.map(a => { const r = bucket[a.key]; const v = t.verify(extractOrderedInserts(r)); return { key: a.key, label: a.label, correct: v.ok && done(r), note: !done(r) ? 'not done' : v.note, errors: errors(r), ...stats(r), run_id: r?.run_id ?? '?' }; });
}

raw.metadata.finished_at = new Date().toISOString();
scored.metadata.finished_at = raw.metadata.finished_at;

const scaleTotals = architectures.map(c => {
  const rows = scaleTests.flatMap(t => scored.suites.scaling[t.id].filter(r => r.key === c.key));
  return { key: c.key, label: c.label, family: c.family, total_composite: rows.reduce((s,r) => s + r.composite, 0), passed: rows.filter(r => r.correct).length, tests: rows.length, total_ms: rows.reduce((s,r) => s + r.elapsed_ms, 0), total_llm_calls: rows.reduce((s,r) => s + r.llm_calls, 0), total_errors: rows.reduce((s,r) => s + r.errors, 0) };
}).sort((a,b) => b.total_composite - a.total_composite);
scored.scaling_leaderboard = scaleTotals;

const allScoredRows = [
  ...scored.suites.standard.map(r => ({ suite: 'standard', ...r })),
  ...scored.suites.complex.map(r => ({ suite: 'complex', ...r })),
  ...scored.suites.complex_obstacles.map(r => ({ suite: 'complex_obstacles', ...r })),
  ...Object.entries(scored.suites.scaling).flatMap(([t,rs]) => rs.map(r => ({ suite: `scaling_${t}`, ...r }))),
  ...Object.entries(scored.suites.arena).flatMap(([t,rs]) => rs.map(r => ({ suite: `arena_${t}`, ...r }))),
];

const transportErrors = allScoredRows.filter(r => r.run_id === 'http-error' || r.run_id === 'transport-error').length;
scored.metadata.transport_errors = transportErrors;

const md = [];
md.push('# Dual-Lobe Benchmark Run');
md.push('');
md.push(`- Source repository: \`anasalsawy/your-travel-agent-ccb6b77f\``);
md.push(`- Source commit: \`${SOURCE_SHA}\``);
md.push(`- GitHub Actions run: \`${RUN_ID}\``);
md.push(`- Started: ${raw.metadata.started_at}`);
md.push(`- Finished: ${raw.metadata.finished_at}`);
md.push(`- Transport failures: ${transportErrors}`);
md.push('- Execution path: direct deployed Supabase Edge Functions; model router uses configured backend providers, so Lovable editor credits are not required.');
md.push('');
md.push('## Scaling leaderboard');
md.push('');
md.push('| Rank | Architecture | Family | Composite / 500 | Passed | LLM calls | Errors |');
md.push('|---:|---|---|---:|---:|---:|---:|');
scaleTotals.forEach((r,i) => md.push(`| ${i+1} | ${r.label} | ${r.family} | ${r.total_composite.toFixed(1)} | ${r.passed}/${r.tests} | ${r.total_llm_calls} | ${r.total_errors} |`));
md.push('');
md.push('## Complex suite');
md.push('');
for (const name of ['complex','complex_obstacles']) {
  md.push(`### ${name}`);
  md.push('');
  md.push('| Architecture | Correct | Composite | ms | LLM | Errors | Note |');
  md.push('|---|---|---:|---:|---:|---:|---|');
  [...scored.suites[name]].sort((a,b) => b.composite - a.composite).forEach(r => md.push(`| ${r.label} | ${r.correct ? 'PASS' : 'FAIL'} | ${r.composite.toFixed(1)} | ${r.elapsed_ms} | ${r.llm_calls} | ${r.errors} | ${String(r.note).replaceAll('|','/')} |`));
  md.push('');
}
md.push('## Interpretation guardrail');
md.push('');
md.push('These are engineering benchmark results from one deployed system and one mutable operational dataset. They are not peer-reviewed evidence of general superiority. Repeated trials, frozen datasets, model/version pinning, confidence intervals, and independent replication are required before broad claims.');

await fs.writeFile(path.join(OUT, 'raw-results.json'), JSON.stringify(raw, null, 2));
await fs.writeFile(path.join(OUT, 'scored-results.json'), JSON.stringify(scored, null, 2));
await fs.writeFile(path.join(OUT, 'REPORT.md'), md.join('\n'));
console.log(md.join('\n'));
