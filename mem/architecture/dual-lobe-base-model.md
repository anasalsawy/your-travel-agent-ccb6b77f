---
name: Dual-Lobe Base Model
description: Canonical architecture — Dual-Lobe is the base; Cerebellum and 3/5/7-point brain modules are additive layers, not alternatives.
type: feature
---
# Dual-Lobe Base Architecture

**Dual-Lobe (Strategist + Executor) is the base configuration** for every agent runtime. It is never replaced — only extended.

## Layering rules
- **Base (always on):** Dual-Lobe — Strategist (Sense/Judge) + Executor (Act/Motor), parallel-pipelined.
- **Lobe Dynamics Lab:** the mix-and-match playground (alternating, contralateral, reflex-arc, etc.) — experimental wirings ON TOP of the dual-lobe base.
- **Cerebellum (add-on):** skill/automation store. When an agent completes a task successfully, the winning step sequence is compiled into a reusable **skill**. On future matching tasks, cerebellum surfaces the skill to the dual lobes so they execute without re-thinking.
- **3-, 5-, 7-point brain (add-ons):** additional specialized layers stacked over the dual-lobe base (e.g., limbic/priority, memory, meta-review). Each is optional and additive — none replaces the base pair.

## Implications for the Isolation Lab
- Every architecture in the lab must START from the dual-lobe base.
- Cerebellum and brain-point modules appear as **toggleable add-ons**, not alternative topologies.
- Removing an add-on must leave a working dual-lobe agent.

## Brain-inspired add-on catalog
Full 10-mechanism catalog and priority build order: `mem://architecture/brain-inspired-addons` (spec: `docs/brain-inspired-patterns.md`).
