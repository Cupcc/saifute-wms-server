# Playbooks

This directory stores accumulated task-execution experience organized by domain.

Playbooks fill the gap between frozen rules (`.cursor/rules/*.mdc`) and single-task docs (`docs/tasks/*.md`). They capture evolving tactical knowledge that survives task archival and helps agents reproduce successful patterns on future tasks.

## Knowledge ladder

```
.cursor/rules/*.mdc              L4  frozen constraints (cross-task, confirmed, immutable)
.cursor/skills/*/SKILL.md        L3  structured skills (stable execution flows)
docs/playbooks/*/playbook.md     L2  domain experience (evolving tactical knowledge)
docs/playbooks/*/*.ts|sh         L2  reusable scripts (automated experience)
docs/tasks/*.md                  L1  task runtime state (single-task lifecycle)
```

## Orthogonal layers

```
docs/workspace/**                decision workspace (human decision support, rich media)
docs/requirements/*.md           user-facing interaction (intent + status)
```

These are not part of the knowledge ladder (they don't represent accumulated experience maturity) but are essential context layers referenced during orchestration.

## Related reference layers

- `docs/dependencies/` — external library versions, APIs, deprecation notes (Context7 refreshed)
- `docs/architecture/` — module boundaries, business flows, schema design
- `docs/workspace/` — human decision workspace, see `docs/workspace/README.md`

## Directory layout

Each domain gets its own folder. Start with a `playbook.md`; add scripts when a manual check appears 2+ times.

```
docs/playbooks/
├── README.md                          # this file
├── browser/
│   ├── playbook.md
│   └── ...
├── migration/
│   ├── playbook.md                    # text experience entries
│   ├── check-idempotency.ts           # reusable helper (example)
│   └── ...
├── ralph/
│   ├── project-instructions.md
│   ├── cli-project-bootstrap.md
│   └── ...
└── <domain>/
    ├── playbook.md
    └── ...
```

## Entry format

Playbook 条目默认使用中文撰写。命令、路径、代码标识、外部系统原文名称可保留原文；只有在引用英文报错、协议字段、或不可直译的专有名词时才混用英文。

Each entry in `playbook.md` follows this structure:

```markdown
## YYYY-MM-DD · short title

**Source task**: task doc path or brief description
**Scenario**: what happened
**Lesson**: what we learned
**Reusable action**: concrete step to reproduce or avoid the issue
**Maturity**: initial observation | verified ✓ | promoted → rules/xxx.mdc
```

## Script conventions

- Scripts live next to their domain's `playbook.md`.
- They are utility helpers, not project runtime dependencies — `docs/playbooks/` is not in the application import graph.
- Include a usage comment at the top: `// Usage: npx tsx docs/playbooks/migration/check-foo.ts [args]`
- Keep them self-contained; minimize imports from `src/`.

## Lifecycle

```
task execution discovers a pattern
       ↓
  append text entry to docs/playbooks/{domain}/playbook.md  (maturity: initial observation)
       ↓  same manual check appears 2+ times
  extract reusable script to docs/playbooks/{domain}/*.ts
       ↓  later tasks validate the entry
  update maturity to "verified ✓"
       ↓  domain experience becomes structured and stable enough
  promote to .cursor/skills/{domain}/SKILL.md  (skill references playbook)
       ↓  single entry is frozen and universally applicable
  promote to .cursor/rules/*.mdc
  mark entry as "promoted → rules/xxx.mdc"
```

## When to write

The orchestration skill triggers playbook writing during the **retrospect** phase after task completion. Entries can also be added manually at any time.

Write an entry when:

- A non-obvious pattern led to success or failure
- A review → fix loop repeated 2+ times for the same root cause
- A validation gap was discovered late
- A migration, backfill, or reconciliation step had an unexpected edge case
- An orchestration or subagent coordination issue was resolved

Do not write entries for:

- Obvious or well-documented library behavior (that belongs in `docs/dependencies/`)
- One-off task status (that belongs in `docs/tasks/`)
- Frozen architectural constraints (those are already in `docs/architecture/` or `.cursor/rules/`)

## Discovery

Agents discover playbooks through two paths:

1. The orchestration SKILL.md directs the planner to read relevant playbooks during the Required context step.
2. The `subagent-context-boundaries.mdc` rule lists playbooks in the knowledge layering definition.
