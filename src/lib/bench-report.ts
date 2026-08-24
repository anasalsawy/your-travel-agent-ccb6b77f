// BENCH REPORT — comprehensive PDF export for the Dual-Lobe / Brain-7 bench.
//
// Produces a research-reference document:
//   1. Cover + abstract + method
//   2. Architecture paper: one page-block per design, each with a vector diagram
//   3. Result tables for every suite that was actually run
//   4. Per-architecture transcript appendix (truncated)
//
// Diagrams are drawn with jsPDF vector primitives, so they stay crisp at any
// zoom and add no image weight to the file.
import { jsPDF } from "jspdf";

export type ReportRow = {
  label: string;
  ok?: boolean | null;
  ms?: number;
  llm?: number;
  tools?: number;
  errors?: number;
  score?: number;
  note?: string;
};

export type ReportSection = {
  title: string;
  subtitle?: string;
  columns?: string[];
  rows: ReportRow[];
};

export type ReportInput = {
  task: string;
  mode: string;
  obstacles?: boolean;
  sections: ReportSection[];
  transcripts?: Array<{ label: string; lines: string[] }>;
};

// ── The paper ───────────────────────────────────────────────────────────────
type Design = {
  key: string;
  title: string;
  family: "Brain" | "Dual-lobe" | "Single-lobe";
  thesis: string;
  mechanism: string[];
  strengths: string;
  weaknesses: string;
  diagram: (d: jsPDF, x: number, y: number, w: number) => number; // returns height used
};

const INK = { body: [30, 30, 34], mute: [110, 112, 120], line: [180, 183, 190], accent: [70, 70, 200] } as const;

function box(d: jsPDF, x: number, y: number, w: number, h: number, label: string, fill?: [number, number, number]) {
  if (fill) { d.setFillColor(fill[0], fill[1], fill[2]); d.roundedRect(x, y, w, h, 1.5, 1.5, "F"); }
  d.setDrawColor(INK.line[0], INK.line[1], INK.line[2]);
  d.roundedRect(x, y, w, h, 1.5, 1.5, "S");
  d.setFontSize(7.5);
  d.setTextColor(INK.body[0], INK.body[1], INK.body[2]);
  const lines = d.splitTextToSize(label, w - 3);
  const startY = y + h / 2 - ((lines.length - 1) * 3) / 2 + 1;
  lines.forEach((l: string, i: number) => d.text(l, x + w / 2, startY + i * 3, { align: "center" }));
}

function arrow(d: jsPDF, x1: number, y1: number, x2: number, y2: number, label?: string) {
  d.setDrawColor(120, 122, 132);
  d.line(x1, y1, x2, y2);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a = 1.8;
  d.line(x2, y2, x2 - a * Math.cos(ang - 0.5), y2 - a * Math.sin(ang - 0.5));
  d.line(x2, y2, x2 - a * Math.cos(ang + 0.5), y2 - a * Math.sin(ang + 0.5));
  if (label) {
    d.setFontSize(6.5);
    d.setTextColor(INK.mute[0], INK.mute[1], INK.mute[2]);
    d.text(label, (x1 + x2) / 2, (y1 + y2) / 2 - 1.2, { align: "center" });
  }
}

const LOBE_FILL: [number, number, number] = [232, 238, 252];
const MOTOR_FILL: [number, number, number] = [253, 238, 228];
const TOOL_FILL: [number, number, number] = [238, 240, 244];

/** Sensory ⇄ Motor pair with a tool bus underneath. */
function pairDiagram(caption: string, crossed = false, gated?: string) {
  return (d: jsPDF, x: number, y: number, w: number) => {
    const bw = (w - 18) / 2;
    box(d, x, y, bw, 14, "SENSORY lobe\n(perception / planning)", LOBE_FILL);
    box(d, x + bw + 18, y, bw, 14, "MOTOR lobe\n(action / dispatch)", MOTOR_FILL);
    arrow(d, x + bw, y + 5, x + bw + 18, y + 5, gated ?? "message");
    arrow(d, x + bw + 18, y + 10, x + bw, y + 10, "reply");
    const ty = y + 26;
    box(d, x, ty, bw, 11, crossed ? "MOTOR tools (write)" : "SENSORY tools (read)", TOOL_FILL);
    box(d, x + bw + 18, ty, bw, 11, crossed ? "SENSORY tools (read)" : "MOTOR tools (write)", TOOL_FILL);
    arrow(d, x + bw / 2, y + 14, x + bw / 2, ty);
    arrow(d, x + bw + 18 + bw / 2, y + 14, x + bw + 18 + bw / 2, ty);
    d.setFontSize(6.5);
    d.setTextColor(INK.mute[0], INK.mute[1], INK.mute[2]);
    d.text(caption, x, ty + 15);
    return 42;
  };
}

const DESIGNS: Design[] = [
  {
    key: "brain",
    title: "Brain-7 — seven-region neuro-inspired loop",
    family: "Brain",
    thesis:
      "Cognition is decomposed into seven specialised regions executed as a pipeline per cycle, so perception, risk, memory, planning, gating, action and error-correction are separately observable and separately fixable.",
    mechanism: [
      "Thalamus relays the task and normalises inputs into a single sensory frame.",
      "Amygdala scores risk and can veto irreversible actions before planning starts.",
      "Hippocampus injects retrieved memory (recent runs, prior tool outcomes).",
      "Prefrontal cortex plans the next single step and states the expected result.",
      "Basal ganglia gate the plan: approve, downscope, or send back for replanning.",
      "Motor cortex dispatches exactly one tool call per cycle.",
      "Cerebellum compares expected vs actual and emits the correction for next cycle.",
    ],
    strengths: "Highest interpretability; risk veto and error correction are first-class; degrades gracefully under adversarial constraints.",
    weaknesses: "Most LLM calls per unit of work; latency dominated by pipeline depth.",
    diagram: (d, x, y, w) => {
      const names = ["Thalamus\nrelay", "Amygdala\nrisk", "Hippocampus\nmemory", "PFC\nplan", "Basal ganglia\ngate", "Motor\ndispatch", "Cerebellum\ncorrect"];
      const cols = 4;
      const gap = 5;
      const bw = (w - gap * (cols - 1)) / cols;
      let used = 0;
      names.forEach((n, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const bx = x + c * (bw + gap), by = y + r * 22;
        box(d, bx, by, bw, 15, n, r === 0 ? LOBE_FILL : MOTOR_FILL);
        if (c > 0) arrow(d, bx - gap, by + 7.5, bx, by + 7.5);
        used = by + 15 - y;
      });
      // feedback edge cerebellum → thalamus
      const lastY = y + 22 + 15;
      arrow(d, x + 2 * (bw + gap) + bw / 2, lastY, x + bw / 2, lastY + 6);
      arrow(d, x + bw / 2, lastY + 6, x + bw / 2, y + 15.5);
      d.setFontSize(6.5);
      d.setTextColor(INK.mute[0], INK.mute[1], INK.mute[2]);
      d.text("correction signal folded back into the next cycle", x + bw + gap, lastY + 5);
      return used + 12;
    },
  },
  {
    key: "dialogue",
    title: "Dual · Dialogue — free conversation between lobes",
    family: "Dual-lobe",
    thesis: "Two LLMs, one holding perception and one holding action, converse freely until the sensory lobe declares completion.",
    mechanism: [
      "Full shared transcript; either lobe may speak or call a tool on its turn.",
      "Completion is asserted by the sensory lobe only, preventing premature 'done' from the actuator.",
    ],
    strengths: "Simplest dual design; strong on open-ended research tasks.",
    weaknesses: "Chattiness inflates token cost; can loop on ambiguity without a gate.",
    diagram: pairDiagram("Full shared transcript. Either side may act."),
  },
  {
    key: "motor",
    title: "Dual · Motor-cortex — strategist plus reflex dispatcher",
    family: "Dual-lobe",
    thesis: "One reasoning LLM issues intents; a thin motor layer converts intents into tool calls without further reasoning.",
    mechanism: [
      "Strategist emits a structured intent envelope.",
      "Motor dispatcher validates against the allowlist and executes; no free-form motor reasoning.",
    ],
    strengths: "Fewest LLM calls per tool call; predictable execution surface.",
    weaknesses: "Cannot recover from malformed intents on its own; relies on strategist quality.",
    diagram: pairDiagram("Motor layer is a dispatcher, not a reasoner."),
  },
  {
    key: "alternating",
    title: "Dual · Alternating — strict L/R cadence with a short window",
    family: "Dual-lobe",
    thesis: "Enforced turn-taking with a 2-turn visibility window tests whether coordination survives severe context truncation.",
    mechanism: ["Fixed cadence, no back-channel.", "Each lobe sees only the last two turns; long-horizon state must be re-derived or written down."],
    strengths: "Very low context growth; cheap at long horizons.",
    weaknesses: "Forgets multi-step constraints; weakest on ordered multi-write tasks.",
    diagram: pairDiagram("Visibility window = last 2 turns only."),
  },
  {
    key: "contralateral",
    title: "Dual · Contralateral — crossed tool ownership",
    family: "Dual-lobe",
    thesis: "Each lobe holds the other's tools, so no single lobe can both perceive and act — every action requires cross-lobe consent.",
    mechanism: ["Sensory lobe owns write tools; motor lobe owns read tools.", "Optic-chiasm style crossover forces negotiation before any mutation."],
    strengths: "Strongest safety property; near-zero forbidden writes under adversarial blockers.",
    weaknesses: "Extra round-trips; slowest on trivial tasks.",
    diagram: pairDiagram("Crossed ownership: acting requires the other lobe.", true),
  },
  {
    key: "reflex",
    title: "Dual · Reflex arc — autonomous reads, consulted writes",
    family: "Dual-lobe",
    thesis: "Reads are reflexive and unmediated; only mutations escalate to the deliberative lobe.",
    mechanism: ["Motor lobe auto-fires read tools with no consultation.", "Sensory lobe is invoked only when a write is proposed."],
    strengths: "Excellent latency on read-heavy work; cheap.",
    weaknesses: "Can over-read; blind to read-side traps such as decoy tables.",
    diagram: pairDiagram("Reads bypass deliberation; writes do not.", false, "writes only"),
  },
  {
    key: "asym",
    title: "Dual · Asymmetric — heavy/light capability tiers",
    family: "Dual-lobe",
    thesis: "Capability is allocated where errors are expensive: sensory-heavy for research, motor-heavy for booking and payment flows.",
    mechanism: [
      "Tiers are requested as 'heavy' / 'light' capability classes, never as vendor model names.",
      "The router resolves a tier to whichever healthy model currently serves it.",
    ],
    strengths: "Best cost/quality ratio; vendor-neutral by construction.",
    weaknesses: "Behaviour shifts as the underlying tier resolution changes.",
    diagram: pairDiagram("Tier request ('heavy'/'light') resolved by the router."),
  },
  {
    key: "bandwidth",
    title: "Dual · Bandwidth-gated — corpus-callosum budget",
    family: "Dual-lobe",
    thesis: "Cross-lobe messages are capped at roughly 40 tokens, forcing compression of intent instead of transcript sharing.",
    mechanism: ["Hard token ceiling per inter-lobe message.", "Detail must be re-derived from tools rather than relayed."],
    strengths: "Lowest inter-lobe token cost; scales to many lobes.",
    weaknesses: "Compression loses constraints; fails length/ordering rules more often.",
    diagram: pairDiagram("Cross-lobe channel capped at ~40 tokens.", false, "≤40 tok"),
  },
  {
    key: "single",
    title: "Single-lobe baseline — one model, all tools",
    family: "Single-lobe",
    thesis: "Control condition. A dual architecture only earns its complexity if it beats this baseline at equal tools and equal mode.",
    mechanism: ["One LLM, full tool allowlist, same envelope and loop.", "Run at both a heavy and a light capability tier."],
    strengths: "Lowest coordination overhead; hard to beat on trivial tasks.",
    weaknesses: "No internal check; single point of reasoning failure under adversarial constraints.",
    diagram: (d, x, y, w) => {
      box(d, x + w / 4, y, w / 2, 14, "SINGLE lobe (one LLM)", LOBE_FILL);
      box(d, x, y + 26, w / 2 - 5, 11, "read tools", TOOL_FILL);
      box(d, x + w / 2 + 5, y + 26, w / 2 - 5, 11, "write tools", TOOL_FILL);
      arrow(d, x + w / 2, y + 14, x + w / 4, y + 26);
      arrow(d, x + w / 2, y + 14, x + (3 * w) / 4, y + 26);
      d.setFontSize(6.5);
      d.setTextColor(INK.mute[0], INK.mute[1], INK.mute[2]);
      d.text("No internal reviewer: perception and action share one context.", x, y + 42);
      return 44;
    },
  },
];

function routerDiagram(d: jsPDF, x: number, y: number, w: number) {
  const bw = (w - 20) / 3;
  box(d, x, y, w, 12, "Agent loop — requests a CAPABILITY ('auto' / 'heavy' / 'light'), never a vendor model", LOBE_FILL);
  box(d, x, y + 22, w, 12, "Model router — health scoring, stickiness, switch governor, traffic organizer", TOOL_FILL);
  arrow(d, x + w / 2, y + 12, x + w / 2, y + 22);
  box(d, x, y + 44, bw, 13, "PRIMARY\nself-hosted / Featherless pool", MOTOR_FILL);
  box(d, x + bw + 10, y + 44, bw, 13, "FALLBACK\nnext healthy model in pool", MOTOR_FILL);
  box(d, x + 2 * (bw + 10), y + 44, bw, 13, "EMERGENCY\ngateway (life support only)", MOTOR_FILL);
  arrow(d, x + bw / 2, y + 34, x + bw / 2, y + 44);
  arrow(d, x + bw + 10 + bw / 2, y + 34, x + bw + 10 + bw / 2, y + 44);
  arrow(d, x + 2 * (bw + 10) + bw / 2, y + 34, x + 2 * (bw + 10) + bw / 2, y + 44);
  return 62;
}

// ── PDF builder ─────────────────────────────────────────────────────────────
const PAGE = { w: 210, h: 297, m: 16 };

export function buildBenchReport(input: ReportInput): jsPDF {
  const d = new jsPDF({ unit: "mm", format: "a4" });
  const W = PAGE.w - PAGE.m * 2;
  let y = PAGE.m;
  let page = 1;

  const footer = () => {
    d.setFontSize(7);
    d.setTextColor(INK.mute[0], INK.mute[1], INK.mute[2]);
    d.text("Your Travel Agent · Council Architecture Bench", PAGE.m, PAGE.h - 8);
    d.text(String(page), PAGE.w - PAGE.m, PAGE.h - 8, { align: "right" });
  };

  const newPage = () => { footer(); d.addPage(); page++; y = PAGE.m; };
  const need = (h: number) => { if (y + h > PAGE.h - 18) newPage(); };

  const h1 = (t: string) => {
    need(14);
    d.setFont("helvetica", "bold"); d.setFontSize(14);
    d.setTextColor(INK.body[0], INK.body[1], INK.body[2]);
    d.text(t, PAGE.m, y); y += 6;
    d.setDrawColor(INK.accent[0], INK.accent[1], INK.accent[2]);
    d.line(PAGE.m, y, PAGE.m + W, y); y += 6;
  };
  const h2 = (t: string) => {
    need(10);
    d.setFont("helvetica", "bold"); d.setFontSize(10.5);
    d.setTextColor(INK.body[0], INK.body[1], INK.body[2]);
    d.text(t, PAGE.m, y); y += 5;
  };
  const p = (t: string, size = 9, italic = false) => {
    d.setFont("helvetica", italic ? "italic" : "normal"); d.setFontSize(size);
    d.setTextColor(INK.body[0], INK.body[1], INK.body[2]);
    const lines = d.splitTextToSize(t, W);
    lines.forEach((l: string) => { need(5); d.text(l, PAGE.m, y); y += size * 0.48 + 1.2; });
    y += 1.5;
  };
  const bullets = (items: string[]) => {
    d.setFont("helvetica", "normal"); d.setFontSize(8.5);
    items.forEach((it) => {
      const lines = d.splitTextToSize(it, W - 5);
      lines.forEach((l: string, i: number) => {
        need(5);
        d.setTextColor(INK.body[0], INK.body[1], INK.body[2]);
        if (i === 0) d.text("•", PAGE.m, y);
        d.text(l, PAGE.m + 4, y); y += 4.2;
      });
    });
    y += 2;
  };
  const kv = (k: string, v: string) => {
    d.setFont("helvetica", "bold"); d.setFontSize(8.5);
    const kw = d.getTextWidth(k + " ");
    need(5); d.text(k, PAGE.m, y);
    d.setFont("helvetica", "normal");
    const lines = d.splitTextToSize(v, W - kw);
    lines.forEach((l: string, i: number) => { if (i) need(5); d.text(l, PAGE.m + (i ? 0 : kw), y); y += 4.2; });
    y += 1;
  };

  // ── Cover ───────────────────────────────────────────────────────────────
  d.setFont("helvetica", "bold"); d.setFontSize(22);
  d.setTextColor(INK.body[0], INK.body[1], INK.body[2]);
  y += 22;
  d.text("Multi-Lobe Agent Architectures", PAGE.m, y); y += 10;
  d.setFontSize(13); d.setTextColor(INK.mute[0], INK.mute[1], INK.mute[2]);
  d.text("Benchmark report and design reference", PAGE.m, y); y += 14;
  d.setDrawColor(INK.accent[0], INK.accent[1], INK.accent[2]);
  d.line(PAGE.m, y, PAGE.m + W, y); y += 10;

  kv("Generated:", new Date().toUTCString());
  kv("Execution mode:", input.mode + (input.obstacles ? " · adversarial blockers ON" : ""));
  kv("Suites in this report:", input.sections.map((s) => s.title).join("; ") || "none run");
  kv("Model policy:", "capability-tier requests resolved by the vendor-neutral router (primary → fallback → emergency).");
  y += 4;
  h2("Abstract");
  p(
    "This report measures whether decomposing an autonomous agent into specialised lobes produces measurably better task execution than a single large model holding the same tools. Every architecture receives an identical task, identical tool allowlist and identical execution mode. Scoring rewards verified task completion first, then latency, then model-call efficiency, and penalises tool errors and forbidden writes. The single-lobe baselines are the control condition: a lobed architecture is only justified where it outscores them.",
  );
  h2("Method");
  bullets([
    "Identical prompt, tools and mode across all contenders; runs are executed in parallel per suite and sequenced between suites to avoid provider overload.",
    "Correctness is verified structurally, not by self-report: each suite scans the run ledger for the ordered writes the task required.",
    "Composite score per test = 50 correctness + 25 speed + 25 model-call efficiency − 4 per tool error.",
    "No architecture may request a vendor model directly; all capability requests pass through the router, so results reflect architecture rather than a single vendor's availability.",
  ]);
  h2("Model supply chain under test");
  const rh = routerDiagram(d, PAGE.m, y, W); y += rh;
  p("Every lobe asks for a capability. The router owns provider choice, health scoring and concurrency budgeting, which is why a provider outage or credit exhaustion degrades throughput rather than failing the bench.", 8.5, true);

  kv("Task under test:", input.task.slice(0, 1400));

  // ── Architecture paper ─────────────────────────────────────────────────
  newPage();
  h1("Part I — Architecture reference");
  DESIGNS.forEach((des) => {
    need(80);
    h2(des.title);
    d.setFont("helvetica", "italic"); d.setFontSize(8);
    d.setTextColor(INK.mute[0], INK.mute[1], INK.mute[2]);
    d.text(des.family + " family", PAGE.m, y); y += 5;
    p(des.thesis, 9);
    const used = des.diagram(d, PAGE.m, y, W); y += used + 2;
    bullets(des.mechanism);
    kv("Strengths:", des.strengths);
    kv("Trade-offs:", des.weaknesses);
    y += 4;
  });

  // ── Results ─────────────────────────────────────────────────────────────
  newPage();
  h1("Part II — Measured results");
  if (!input.sections.length) {
    p("No suite results were present when this report was generated. Run a suite and export again.", 9, true);
  }
  input.sections.forEach((sec) => {
    need(30);
    h2(sec.title);
    if (sec.subtitle) p(sec.subtitle, 8, true);
    const cols = sec.columns ?? ["Architecture", "Done", "Score", "ms", "LLM", "Tools", "Err", "Note"];
    const widths = [52, 12, 16, 18, 12, 14, 12, W - 136];
    d.setFont("helvetica", "bold"); d.setFontSize(7.5);
    need(8);
    let cx = PAGE.m;
    cols.forEach((c, i) => { d.text(c, cx, y); cx += widths[i]; });
    y += 2; d.setDrawColor(INK.line[0], INK.line[1], INK.line[2]);
    d.line(PAGE.m, y, PAGE.m + W, y); y += 4;
    d.setFont("helvetica", "normal");
    sec.rows.forEach((r) => {
      need(6);
      cx = PAGE.m;
      const cells = [
        r.label,
        r.ok == null ? "—" : r.ok ? "yes" : "no",
        r.score == null ? "—" : r.score.toFixed(1),
        r.ms == null ? "—" : String(Math.round(r.ms)),
        r.llm == null ? "—" : String(r.llm),
        r.tools == null ? "—" : String(r.tools),
        r.errors == null ? "—" : String(r.errors),
        r.note ?? "",
      ];
      cells.forEach((c, i) => {
        const lines = d.splitTextToSize(String(c), widths[i] - 2);
        d.setTextColor(i === 1 && r.ok === false ? 190 : INK.body[0], i === 1 && r.ok === false ? 60 : INK.body[1], i === 1 && r.ok === false ? 60 : INK.body[2]);
        d.text(lines[0] ?? "", cx, y);
        cx += widths[i];
      });
      y += 4.6;
    });
    y += 5;
  });

  // ── Appendix ────────────────────────────────────────────────────────────
  if (input.transcripts?.length) {
    newPage();
    h1("Appendix — run transcripts (truncated)");
    input.transcripts.forEach((t) => {
      need(16);
      h2(t.label);
      d.setFont("courier", "normal"); d.setFontSize(7);
      t.lines.slice(0, 60).forEach((l) => {
        const lines = d.splitTextToSize(l, W);
        lines.slice(0, 4).forEach((ln: string) => { need(4); d.text(ln, PAGE.m, y); y += 3.2; });
      });
      d.setFont("helvetica", "normal");
      y += 4;
    });
  }

  footer();
  return d;
}

export function downloadBenchReport(input: ReportInput, filename = "dual-lobe-bench-report.pdf") {
  buildBenchReport(input).save(filename);
}
