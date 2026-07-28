---
name: Brain-Inspired Add-On Roadmap
description: Priority stackable add-ons for the Dual-Lobe base, derived from 10 neuroscience mechanisms. Full spec in docs/brain-inspired-patterns.md.
type: feature
---
# Brain-Inspired Add-Ons (over Dual-Lobe Base)

Full patterns + citations: `docs/brain-inspired-patterns.md`.

## The 10 mechanisms → agent mappings
1. **Corpus callosum** → typed compressed `handoff_packet` between Strategist ↔ Executor (never raw scratchpads).
2. **Thalamus** → `thalamic_gate` router: top-K add-on outputs admitted per turn based on signal strength × gain.
3. **Salience network** → `salience_monitor` toggles `task_positive` (active loop) vs `default` (replay/consolidation).
4. **Predictive coding** → log `expected_outcome` vs `actual_outcome`; only surprises (`error_magnitude > τ`) surface upward.
5. **Hippocampal replay** → idle-time `replay_worker` distills low-confidence episodes into fixed-memory rules.
6. **Cerebellum** → already shipped; add forward-model check (predicted vs actual) to demote stale cached skills.
7. **Basal ganglia** → `action_gate` Go/NoGo layer between plan and every tool call (policy/cost/risk table).
8. **Global workspace** → `workspace.bids` competition + single `broadcast()` step, not N×N module wiring.
9. **Working memory** → bounded K-slot `working_memory` scratchpad, distinct from persistent session/fixed memory.
10. **Neuromodulators** → `neuromodulator_state` (dopamine/norepinephrine/acetylcholine/serotonin, 0–1) injected as compact prompt prefix modulating both lobes uniformly.

## Priority build order (highest leverage first)
1. **Salience/mode-switch monitor** — cheapest, biggest coherence payoff; also unlocks idle-time replay.
2. **Action gate (Go/NoGo)** — clean policy/safety enforcement point decoupled from prompts.
3. **Prediction-error logging** — labels every Executor action; feeds cerebellum + consolidation.
4. **Neuromodulator scalar state** — system-wide behavior tuning via a tiny prompt prefix.
5. **Working-memory scratchpad** — bounded per-turn state, reduces context bloat.

## Rule
Every new add-on must be a **toggle over the Dual-Lobe base** (see `mem://architecture/dual-lobe-base-model`), never a replacement. Removing any add-on must leave a working dual-lobe agent.
