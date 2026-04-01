# Orchestration Playbook

Accumulated execution experience for subagent coordination, parallel writer management, review loops, and cross-chat continuation.

---

## Acceptance Mode Selection

- `none`: no meaningful runtime behavior change, or the user explicitly says to skip acceptance.
- `light`: the default for low-risk runtime changes when direct evidence in the task doc is enough.
- `full`: UI, multi-role, cross-page, high-risk, release-gating, or explicitly strict acceptance work; use `acceptance-qa` plus `docs/acceptance-tests/**`.

## Acceptance Guardrails

- Keep only these as hard constraints: requirement acceptance-state aggregation, audited full-mode runs, explicit `environment-gap` routing, QA not editing business code, and evidence-backed `accepted`.
- Treat everything else as mode-dependent defaults, not as a one-size-fits-all forced workflow.

## Full-Mode Closure

- Prepare or reuse an acceptance spec before full-mode execution when possible.
- Freeze a selected-case snapshot inside each acceptance run.
- Do not archive while any linked acceptance run remains `blocked`.

<!-- Append new entries below in reverse chronological order. -->
