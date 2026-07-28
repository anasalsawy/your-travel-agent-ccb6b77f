# Brain-Inspired Patterns for Multi-Lobe LLM Agents

This document translates ten neuroscience mechanisms of inter-region brain communication into concrete implementation patterns for a **dual-lobe LLM agent system** (Strategist + Executor) with stackable add-ons. It assumes a system that already has: dual-lobe base, persistent session, fixed memory, memory lifecycle, sensory scan, and cerebellum-style skill capture.

---

## 1. Corpus Callosum — Inter-Hemispheric Bandwidth & Handoff

**Neuroscience:** The corpus callosum (~200M axons) is the main channel between hemispheres; interhemispheric transfer time (~10-30ms) scales with white-matter integrity, and callosal signaling can be excitatory or inhibitory depending on task, not just a "wire." ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0028393223002956), [PubMed](https://pubmed.ncbi.nlm.nih.gov/16211466/))

**Mapping to agents:** Strategist and Executor are the two "hemispheres" — the channel between them is not a full transcript dump but a compressed, typed handoff packet. Bandwidth is finite and lossy by design (forces summarization, not full context sharing).

**Concrete pattern:** Define a `handoff_packet` schema (JSON: `goal`, `constraints`, `key_facts[]`, `open_questions[]`, `confidence`) capped at N tokens. An edge function `handoff()` compresses Strategist output into this schema before invoking Executor, and vice versa for return handoffs — never pass raw scratchpads across the boundary.

---

## 2. Thalamus — Central Relay & Router

**Neuroscience:** The thalamus is not a passive relay: ~95% of input to relay cells (e.g., LGN) is non-retinal/feedback, dynamically gating what reaches cortex based on behavioral state and attention; cortico-thalamo-cortical loops route information between cortical areas. ([Sherman, 2005](https://cpb-us-w2.wpmucdn.com/voices.uchicago.edu/dist/a/2050/files/2020/01/169-2005-Sherman.TRS_.2005.3.205_216.pdf), [Nat Rev Neurosci 2021](https://preview-www.nature.com/articles/s41583-021-00459-3))

**Mapping to agents:** A router/orchestrator layer sits between all add-on modules and the two lobes, deciding which module's output is "let through" this turn based on current state/gain, not just static routing rules.

**Concrete pattern:** Implement a `router` edge function/table `thalamic_gate` (columns: `module`, `signal_strength`, `gain_multiplier`, `state`) that scores each add-on's proposed contribution per turn and only forwards the top-K above threshold into the active prompt context — a learned/heuristic attention gate, not simple concatenation.

---

## 3. Salience Network — Switching DMN ↔ Central Executive

**Neuroscience:** The anterior insula + dorsal anterior cingulate cortex (salience network) detects behaviorally relevant events and causally switches activity between the Default Mode Network (internal/idle) and Central Executive Network (task-focused), per Granger-causality/DCM studies. ([Sridharan et al., PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2899886/), [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1053811914004170), [PubMed](https://pubmed.ncbi.nlm.nih.gov/24862074/))

**Mapping to agents:** A lightweight "salience monitor" watches incoming events/idle time and flips the system between an idle/reflective mode (memory consolidation, self-review) and an active task-execution mode.

**Concrete pattern:** A `salience_monitor` edge function scores each incoming signal (user message, timer tick, error) for novelty/urgency; above threshold it calls `switch_mode(task_positive)` which activates Strategist+Executor task loop, below threshold (idle) it calls `switch_mode(default)` which triggers the memory-consolidation/replay job instead.

---

## 4. Predictive Coding / Free-Energy Principle

**Neuroscience:** Cortex is organized as a hierarchy generating top-down predictions; only the mismatch (prediction error) propagates bottom-up, minimizing surprise/free energy — perception is inference, not passive intake. ([Friston 2006](https://www.fil.ion.ucl.ac.uk/%7Ekarl/A%20free%20energy%20principle%20for%20the%20brain.pdf), [Frontiers 2013](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00276/full))

**Mapping to agents:** Strategist emits a predicted plan/expected-outcome before Executor acts; Executor's actual result is diffed against the prediction, and only the *delta* (error signal) is fed back up, not the full trace — this keeps context compact and highlights surprises.

**Concrete pattern:** Executor calls log to a `predictions` table (`expected_outcome`, `actual_outcome`, `error_magnitude`). A post-hoc diff function computes `error_magnitude`; only entries above threshold are surfaced back into the Strategist's next prompt as "surprise events," reducing token spend on confirmed expectations.

---

## 5. Hippocampal Replay & Consolidation

**Neuroscience:** During rest/sleep, the hippocampus replays recent experience (sharp-wave ripples), preferentially reactivating weakly learned material, and transfers it into cortical long-term storage via a cortical–hippocampal–cortical loop. ([Nature Comms 2018](https://bishtref.com/articles/10.1038/s41467-018-06213-1), [Rothschild et al. 2016, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5783826/))

**Mapping to agents:** This overlaps with your existing memory lifecycle, but the specific add-on is a scheduled "replay" job during idle/salience-low periods that re-surfaces low-confidence or recently-failed episodic memories and asks the Strategist to re-derive general rules from them, writing results into fixed/semantic memory.

**Concrete pattern:** A cron-triggered `replay_worker` selects episodic memory rows ordered by `low confidence DESC, recency DESC`, batches them into a consolidation prompt ("what generalizable rule follows from these episodes?"), and upserts distilled rules into the fixed-memory table with provenance links back to source episodes.

---

## 6. Cerebellar Internal Models — Already Implemented

**Neuroscience:** The cerebellum builds internal forward/inverse models that predict the sensory consequences of motor commands, enabling fast, automatic execution without conscious cortical oversight once a skill is learned.

**Mapping to agents:** Already covered by cerebellum-style skill capture — noted here for completeness; the add-on to consider is a *forward-model check*: before executing a cached skill, predict its outcome and compare to actual, feeding failures back to retrain/retire the cached skill (ties to #4).

**Concrete pattern:** Extend the existing skill-cache table with `predicted_result` and `actual_result` columns; a verifier function flags skills whose prediction-error rate exceeds threshold for demotion back to Strategist-supervised execution.

---

## 7. Basal Ganglia — Go/NoGo Action Gating

**Neuroscience:** The basal ganglia's direct (Go/D1) and indirect (NoGo/D2) pathways from striatum gate which cortically-proposed action is disinhibited and allowed to proceed, implementing a competitive action-selection filter. ([eLife 2023](https://elifesciences.org/articles/87644), [Hazy, Frank & O'Reilly 2007](https://ccnlab.org/papers/HazyFrankOReilly07.pdf), [Gurney et al. 1998](https://eprints.whiterose.ac.uk/id/eprint/155189/1/Gurney%201998%20ICANN.pdf))

**Mapping to agents:** Before Executor commits to a tool call/action, a gating step explicitly approves (Go) or vetoes (NoGo) it against policy/safety/cost constraints — separate from the Strategist's plan generation, so proposal and permission are decoupled.

**Concrete pattern:** An `action_gate` edge function intercepts every proposed tool call, checks it against a rules table (`policy`, `cost_ceiling`, `risk_tier`) and recent failure history, and returns `go`/`nogo`/`hold_for_review` before the call executes — logged to `action_gate_log` for audit and future policy tuning.

---

## 8. Global Workspace Theory / Integrated Information

**Neuroscience:** Global Workspace Theory holds that consciousness arises when information is broadcast widely across specialized modules via a shared workspace; IIT instead emphasizes integrated causal structure. Recent adversarial trials found partial support for GWT's broadcast/ignition dynamics. ([Nature 2025](https://www.nature.com/articles/s41586-025-08888-1))

**Mapping to agents:** The "workspace" is a shared blackboard/context object that any add-on module can write a bid to, and a single broadcast step promotes the winning content into the active prompt seen by both lobes — competition + broadcast, not pairwise messaging between every module pair.

**Concrete pattern:** A `workspace` table holds current-turn `bids` (module, content, priority) from all active add-ons; a `broadcast()` function selects the top bid(s) each cycle and writes them into a single shared `active_context` blob injected into both Strategist and Executor prompts — avoids N×N module-to-module wiring.

---

## 9. Working Memory (PFC + Parietal)

**Neuroscience:** Prefrontal cortex sustains active, capacity-limited representations via persistent firing, in dynamic interaction with parietal cortex for maintaining task-relevant items against distraction; PFC neuromodulation (dopamine/norepinephrine) tunes signal-to-noise of this maintenance. ([Cools & Arnsten 2021](https://www.nature.com/articles/s41386-021-01100-8.pdf))

**Mapping to agents:** A small, strictly bounded "scratchpad" (distinct from long-term/fixed memory) holds only the current task's active variables, refreshed every turn — this is the Strategist's short-term buffer, separate from the persistent session log.

**Concrete pattern:** A `working_memory` table/row per session capped at K slots (`slot_key`, `value`, `expires_at_turn`); Strategist reads/writes this each turn instead of re-scanning the full session transcript, with an eviction policy (LRU or task-relevance score) when slots are full.

---

## 10. Neuromodulators — Global Tuning Signals

**Neuroscience:** Dopamine encodes reward-prediction error and drives learning/motivation; norepinephrine (locus coeruleus) signals arousal and environmental uncertainty, adjusting exploration/exploitation; acetylcholine modulates attention and effective learning rate; serotonin relates to patience/temporal discounting. These act as broadcast scalar signals modulating many circuits at once, not point-to-point messages. ([Avery & Krichmar 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5744617/), [Doya 2002](https://people.sissa.it/~ale/EvolNeurComp/2022/II_Doya_2002.pdf), [Cools & Arnsten 2021](https://www.nature.com/articles/s41386-021-01100-8.pdf))

**Mapping to agents:** Maintain a small set of global scalar "hormone" values that modulate prompt-time behavior of both lobes uniformly, rather than passing more text context — e.g., higher "norepinephrine" value shortens plans and increases hedging; higher "dopamine" value reinforces recently successful strategies.

**Concrete pattern:** A `neuromodulator_state` table (`dopamine`, `norepinephrine`, `acetylcholine`, `serotonin`, each 0-1) updated by outcome events (task success → +dopamine decay; repeated errors/ambiguity → +norepinephrine; task switch → +acetylcholine boosting the memory-lifecycle write-rate; long-horizon tasks → +serotonin raising the Strategist's planning depth/patience). These values are injected as a compact system-prompt prefix (e.g., "arousal: high, patience: low") read by both lobes each turn.

---

## Priority Add-Ons to Build Next

Given the existing stack (dual-lobe base, persistent session, fixed memory, memory lifecycle, sensory scan, cerebellum-style skill capture), the five highest-leverage additions are:

1. **Salience/mode-switch monitor (#3)** — cheapest lever with the biggest coherence payoff: a single scoring function that toggles between idle-consolidation mode and active-task mode prevents wasted cycles and gives structure for scheduling replay.
2. **Action gate / Go-NoGo layer (#7)** — decouples "what to do" from "is it allowed," giving a clean policy/safety enforcement point before any tool call, independent of prompt engineering.
3. **Prediction-error logging (#4)** — turns every Executor action into a labeled training/feedback signal (expected vs actual) that both the cerebellum skill-cache and future memory consolidation can consume; high reuse value.
4. **Neuromodulator scalar state (#10)** — a tiny table + prompt-prefix that lets you tune system-wide behavior (caution, patience, exploration) without touching every prompt template individually.
5. **Working-memory scratchpad (#9)** — bounded, fast-refresh slot store distinct from persistent session/fixed memory, reducing per-turn context bloat and giving the Strategist a reliable "current state" object.

