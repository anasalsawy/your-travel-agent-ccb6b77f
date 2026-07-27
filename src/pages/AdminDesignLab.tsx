// Neural Noir — 3 design variants for the admin console.
// Each variant re-imagines the same content (dual-lobe bench + scoreboard)
// through a different compositional lens. Pick one, we'll roll it out.
import { Link } from "react-router-dom";
import { Brain, Zap, ArrowUpRight, Play, Cpu, MessageCircle, Bot, Circle } from "lucide-react";

export default function AdminDesignLab() {
  return (
    <div className="neural-noir">
      <div className="max-w-[1400px] mx-auto px-8 py-10 space-y-24">
        {/* ── Header ────────────────────────────────────────── */}
        <header className="flex items-start justify-between nn-hair border-b pb-8">
          <div>
            <div className="nn-eyebrow mb-4">Design Lab · Neural Noir</div>
            <h1 className="nn-serif text-5xl leading-none">
              Three ways to look at <em className="nn-ember">the same brain</em>.
            </h1>
            <p className="mt-4 text-sm text-[color:var(--nn-mist)] max-w-xl">
              Same content — bench, scoreboard, isolation lab. Three different compositions.
              Pick the one that reads best to you and I'll roll it out across every admin surface.
            </p>
          </div>
          <div className="nn-hemi">
            <span className="l">Sensory</span>
            <span className="r">Motor</span>
          </div>
        </header>

        {/* ── Variant A ─────────────────────────────────────── */}
        <VariantFrame index="A" name="Cortex" tagline="Split hemispheres. Editorial hero. Data whispers underneath.">
          <VariantA />
        </VariantFrame>

        {/* ── Variant B ─────────────────────────────────────── */}
        <VariantFrame index="B" name="Instrument" tagline="Data-dense editorial spread. Numbers become the composition.">
          <VariantB />
        </VariantFrame>

        {/* ── Variant C ─────────────────────────────────────── */}
        <VariantFrame index="C" name="Observatory" tagline="Monolithic slabs. Ember-only accent. Museum-quiet.">
          <VariantC />
        </VariantFrame>

        <footer className="nn-hair border-t pt-6 text-[color:var(--nn-mist)] text-xs flex justify-between">
          <span>Neural Noir · Instrument Serif + Work Sans · scoped to /admin/*</span>
          <Link to="/admin/dual-lobe" className="hover:text-[color:var(--nn-bone)]">← back to live bench</Link>
        </footer>
      </div>
    </div>
  );
}

function VariantFrame({ index, name, tagline, children }: any) {
  return (
    <section className="space-y-6">
      <div className="flex items-baseline gap-6 nn-hair border-b pb-4">
        <div className="nn-serif text-7xl leading-none nn-ember-glow">{index}</div>
        <div>
          <div className="nn-eyebrow">Variant {index}</div>
          <h2 className="nn-serif text-3xl">{name}</h2>
          <p className="text-xs text-[color:var(--nn-mist)] mt-1">{tagline}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════
   VARIANT A — Cortex
   Two hemispheres literally split the page. Big serif verdict in
   the middle. Numbers whispered underneath.
   ═════════════════════════════════════════════════════════════════ */
function VariantA() {
  return (
    <div className="nn-card-raised overflow-hidden">
      <div className="grid grid-cols-2 min-h-[520px] relative">
        {/* left hemisphere */}
        <div className="p-10 border-r nn-hair relative nn-grid-bg">
          <div className="nn-eyebrow mb-6 flex items-center gap-2">
            <Brain className="w-3 h-3" style={{ color: "var(--nn-sensory)" }} />
            Left · Sensory Lobe
          </div>
          <div className="space-y-1">
            <div className="nn-mono text-[10px] text-[color:var(--nn-mist)]">CYCLE 04 · TURN 07</div>
            <p className="nn-serif text-2xl leading-tight italic">
              "Motor — the notification queue is empty. Try re-reading war_room_messages before the summary."
            </p>
          </div>
          <div className="absolute bottom-8 left-10 right-10 flex items-end justify-between">
            <div>
              <div className="nn-eyebrow">Reads</div>
              <div className="nn-serif text-5xl">14</div>
            </div>
            <div>
              <div className="nn-eyebrow">Errors</div>
              <div className="nn-serif text-5xl">0</div>
            </div>
          </div>
        </div>
        {/* right hemisphere */}
        <div className="p-10 relative nn-dot-bg">
          <div className="nn-eyebrow mb-6 flex items-center gap-2 justify-end">
            Right · Motor Lobe
            <Zap className="w-3 h-3" style={{ color: "var(--nn-motor)" }} />
          </div>
          <div className="space-y-1 text-right">
            <div className="nn-mono text-[10px] text-[color:var(--nn-mist)]">CYCLE 04 · TURN 08</div>
            <p className="nn-serif text-2xl leading-tight italic">
              "Copy. Re-fetching now — <span className="nn-ember">6 new rows since last read</span>."
            </p>
          </div>
          <div className="absolute bottom-8 left-10 right-10 flex items-end justify-between">
            <div>
              <div className="nn-eyebrow">Writes</div>
              <div className="nn-serif text-5xl">3</div>
            </div>
            <div>
              <div className="nn-eyebrow">Tool ok</div>
              <div className="nn-serif text-5xl">9/9</div>
            </div>
          </div>
        </div>
        {/* corpus callosum verdict */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-center pointer-events-none">
          <div className="inline-flex flex-col items-center px-8 py-4 nn-card-raised">
            <div className="nn-eyebrow mb-1">Verdict</div>
            <div className="nn-serif text-3xl nn-ember-glow">Dual · Dialogue wins</div>
            <div className="nn-mono text-[10px] text-[color:var(--nn-mist)] mt-1">+18.2 over best single-LLM</div>
          </div>
        </div>
      </div>
      {/* footer strip */}
      <div className="grid grid-cols-4 border-t nn-hair">
        {[["Dialogue","91.4","🥇"],["Motor-cortex","82.1","🥈"],["Single · flash","73.2","🥉"],["Single · lite","61.0","·"]].map(([n,s,m])=>(
          <div key={n} className="px-6 py-4 border-r nn-hair last:border-r-0">
            <div className="flex items-baseline justify-between">
              <span className="nn-eyebrow">{n}</span>
              <span className="nn-mono text-[10px] text-[color:var(--nn-mist)]">{m}</span>
            </div>
            <div className="nn-serif text-3xl mt-1">{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   VARIANT B — Instrument
   Numbers *are* the design. Editorial data spread, ledger tape
   running down the side, serif callouts pulled from the transcript.
   ═════════════════════════════════════════════════════════════════ */
function VariantB() {
  const rows = [
    { rank: "01", label: "Dual · Dialogue",         score: "91.4", steps: 7, llm: 8, tools: "9/9", ms: "12,840", win: true },
    { rank: "02", label: "Dual · Motor-cortex",     score: "82.1", steps: 5, llm: 5, tools: "8/9", ms: "9,120",  win: false },
    { rank: "03", label: "Single · flash",          score: "73.2", steps: 9, llm: 9, tools: "7/8", ms: "14,200", win: false },
    { rank: "04", label: "Single · flash-lite",     score: "61.0", steps: 11, llm: 11, tools: "6/9", ms: "11,050", win: false },
  ];
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* pull quote */}
      <div className="col-span-4 nn-card p-8 flex flex-col justify-between min-h-[420px]">
        <div className="nn-eyebrow">Corpus callosum · turn 06</div>
        <blockquote className="nn-serif text-3xl leading-tight italic">
          "You keep <span className="nn-ember">re-reading</span> the same table. What are you actually looking for?"
        </blockquote>
        <div className="flex items-center gap-3 text-xs text-[color:var(--nn-mist)]">
          <Brain className="w-3 h-3" style={{ color: "var(--nn-sensory)" }} />
          <span className="nn-mono">SENSORY → MOTOR</span>
        </div>
      </div>
      {/* scoreboard */}
      <div className="col-span-8 nn-card">
        <div className="p-6 border-b nn-hair flex items-baseline justify-between">
          <div>
            <div className="nn-eyebrow">Bench · run 4a7c</div>
            <h3 className="nn-serif text-2xl mt-1">Same task. Four architectures.</h3>
          </div>
          <button className="nn-btn">Re-run <ArrowUpRight className="inline w-3 h-3 ml-1" /></button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left nn-eyebrow border-b nn-hair">
              <th className="px-6 py-3 w-12">#</th>
              <th className="px-6 py-3">Architecture</th>
              <th className="px-6 py-3 text-right">Score</th>
              <th className="px-6 py-3 text-right">Steps</th>
              <th className="px-6 py-3 text-right">LLM</th>
              <th className="px-6 py-3 text-right">Tools</th>
              <th className="px-6 py-3 text-right">ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.rank} className="border-b nn-hair last:border-b-0">
                <td className="px-6 py-5 nn-mono text-xs text-[color:var(--nn-mist)]">{r.rank}</td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    {r.win && <span className="nn-tick" />}
                    <span className={r.win ? "nn-serif text-xl" : "text-sm"}>{r.label}</span>
                  </div>
                </td>
                <td className={`px-6 py-5 text-right ${r.win ? "nn-serif text-3xl nn-ember-glow" : "nn-serif text-xl"}`}>{r.score}</td>
                <td className="px-6 py-5 text-right nn-mono text-xs text-[color:var(--nn-mist)]">{r.steps}</td>
                <td className="px-6 py-5 text-right nn-mono text-xs text-[color:var(--nn-mist)]">{r.llm}</td>
                <td className="px-6 py-5 text-right nn-mono text-xs text-[color:var(--nn-mist)]">{r.tools}</td>
                <td className="px-6 py-5 text-right nn-mono text-xs text-[color:var(--nn-mist)]">{r.ms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* isolation lab strip */}
      <div className="col-span-12 nn-card p-6">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <div className="nn-eyebrow">Isolation Lab</div>
            <h3 className="nn-serif text-xl mt-1">One lobe at a time. Then together.</h3>
          </div>
          <div className="nn-mono text-[10px] text-[color:var(--nn-mist)]">MODEL · gemini-2.5-flash</div>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {[
            { name: "Sensory alone", score: "42.1", note: "sees, cannot act" },
            { name: "Motor alone",   score: "38.7", note: "acts blind" },
            { name: "Combined",      score: "88.3", note: "the pair", win: true },
          ].map(c => (
            <div key={c.name} className={`border-l-2 pl-5 py-2 ${c.win ? "border-[color:var(--nn-ember)]" : "border-[color:var(--nn-fog)]"}`}>
              <div className="nn-eyebrow">{c.name}</div>
              <div className={`nn-serif ${c.win ? "text-5xl nn-ember-glow" : "text-4xl"} mt-1`}>{c.score}</div>
              <div className="text-xs text-[color:var(--nn-mist)] italic mt-1">{c.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   VARIANT C — Observatory
   Maximum quiet. Monolithic slabs. One ember dot per card.
   Reads like a museum wall label for each architecture.
   ═════════════════════════════════════════════════════════════════ */
function VariantC() {
  const cards = [
    { name: "Dialogue",       icon: MessageCircle, sub: "Two LLMs · turn-by-turn",  score: "91.4", tag: "PRIMARY" },
    { name: "Motor-cortex",   icon: Cpu,           sub: "Strategist + reflex arc",   score: "82.1", tag: "FALLBACK" },
    { name: "Single · flash", icon: Bot,           sub: "Baseline · full toolkit",   score: "73.2", tag: "CONTROL" },
    { name: "Single · lite",  icon: Bot,           sub: "Baseline · fast/cheap",     score: "61.0", tag: "CONTROL" },
  ];
  return (
    <div className="space-y-8">
      <div className="nn-card-raised p-14 relative overflow-hidden">
        <div className="absolute inset-0 nn-grid-bg opacity-40" />
        <div className="relative">
          <div className="nn-eyebrow mb-6">The Bench · currently observing</div>
          <h3 className="nn-serif text-6xl leading-[0.95] max-w-3xl">
            Four architectures.<br />
            One task.<br />
            <em className="nn-ember">One winner per run.</em>
          </h3>
          <div className="mt-10 flex items-center gap-6">
            <button className="nn-btn">▸ Begin observation</button>
            <button className="nn-btn nn-btn-ghost">Load previous run</button>
            <div className="ml-auto nn-mono text-[10px] text-[color:var(--nn-mist)]">
              LAST RUN · 4A7C · 2 MIN AGO
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px bg-[color:var(--nn-fog)]">
        {cards.map((c, i) => (
          <div key={c.name} className="nn-card p-8 space-y-8 min-h-[280px] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="nn-eyebrow">{c.tag}</div>
              {i === 0 ? <span className="nn-tick" /> : <Circle className="w-2 h-2 text-[color:var(--nn-fog)]" />}
            </div>
            <div>
              <c.icon className="w-5 h-5 text-[color:var(--nn-mist)] mb-4" />
              <div className="nn-serif text-3xl">{c.name}</div>
              <div className="text-xs text-[color:var(--nn-mist)] mt-1">{c.sub}</div>
            </div>
            <div className="flex items-baseline justify-between border-t nn-hair pt-4">
              <span className="nn-eyebrow">Score</span>
              <span className={`nn-serif ${i === 0 ? "text-5xl nn-ember-glow" : "text-4xl"}`}>{c.score}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="nn-card p-10 flex items-center justify-between">
        <div>
          <div className="nn-eyebrow mb-2">Isolation Lab</div>
          <div className="nn-serif text-2xl">
            Sensory alone: <span className="text-[color:var(--nn-mist)]">42</span>.
            Motor alone: <span className="text-[color:var(--nn-mist)]">39</span>.
            Combined: <span className="nn-ember-glow">88</span>.
          </div>
        </div>
        <button className="nn-btn"><Play className="inline w-3 h-3 mr-2" />Isolate again</button>
      </div>
    </div>
  );
}
