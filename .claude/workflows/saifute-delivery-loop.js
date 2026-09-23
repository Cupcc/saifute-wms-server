export const meta = {
  name: 'saifute-delivery-loop',
  description: '需求→实现→评审→验收 closed-loop delivery for one requirement/task. Reuses the .claude/agents saifute-* roles, catalog routing, docs/tasks handoff, and repo validation gates. Stops at two human gates: unconfirmed requirement, and irreversible ops (migration execute / prisma push / commit / release).',
  phases: [
    { title: 'Discovery' },
    { title: 'Plan' },
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Accept' },
  ],
}

// --- Structured Result schemas (mirror the .codex/agents/*.toml json contracts) ---

const strList = { type: 'array', items: { type: 'string' } }
const nullableStr = { type: ['string', 'null'] }

const DISCOVERY_SCHEMA = {
  type: 'object',
  properties: {
    requirement_path: nullableStr,
    requirement_status: { type: 'string', enum: ['confirmed', 'needs-confirmation', 'missing', 'ambiguous'] },
    active_task_doc: nullableStr,
    catalog_refs: strList,
    summary: { type: 'string' },
    open_questions: strList,
  },
  required: ['requirement_status', 'summary'],
}

const PLANNER_SCHEMA = {
  type: 'object',
  properties: {
    agent: { type: 'string' },
    status: { type: 'string' },
    task_doc_path: { type: 'string' },
    requirement_path: nullableStr,
    acceptance_mode: nullableStr,
    parallelization: nullableStr,
    summary: strList,
    impacted_scope: strList,
    validation: strList,
    risks: strList,
    next_step: nullableStr,
  },
  required: ['status', 'task_doc_path'],
}

const CODER_SCHEMA = {
  type: 'object',
  properties: {
    agent: { type: 'string' },
    status: { type: 'string' },
    task_doc_path: nullableStr,
    requirement_path: nullableStr,
    changed_paths: strList,
    summary: strList,
    contracts: strList,
    validation_ran: strList,
    validation_needed: strList,
    checklist_items: strList,
    risks: strList,
    next_step: nullableStr,
  },
  required: ['status'],
}

const REVIEWER_SCHEMA = {
  type: 'object',
  properties: {
    agent: { type: 'string' },
    status: { type: 'string' },
    task_doc_path: nullableStr,
    acceptance_mode: nullableStr,
    referenced_docs: strList,
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string' },
          area: nullableStr,
          title: { type: 'string' },
        },
        required: ['severity', 'title'],
      },
    },
    validation_ran: strList,
    validation_status: nullableStr,
    evidence: strList,
    risks: strList,
    next_step: nullableStr,
  },
  required: ['status', 'findings'],
}

const ACCEPT_SCHEMA = {
  type: 'object',
  properties: {
    agent: { type: 'string' },
    status: { type: 'string' },
    task_doc_path: nullableStr,
    requirement_path: nullableStr,
    acceptance_mode: nullableStr,
    verification_results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          verdict: { type: 'string' },
          evidence: nullableStr,
        },
        required: ['criterion', 'verdict'],
      },
    },
    spec_path: nullableStr,
    run_path: nullableStr,
    risks: strList,
    next_step: nullableStr,
  },
  required: ['status', 'verification_results'],
}

// ponytail: "blocking" = severity in this set. If the reviewer uses other labels,
// widen this set rather than adding per-label branches.
const BLOCKING = ['blocking', 'important']
const isBlocking = (f) => BLOCKING.includes(String(f && f.severity).toLowerCase())
const j = (v) => JSON.stringify(v ?? null)

// --- Task-local briefs (role identity already lives in .claude/agents/saifute-*.md) ---

const discoveryPrompt = (goal) => `You are the DISCOVERY step of a delivery loop. Do not implement anything and do not confirm any requirement yourself.

Goal: ${goal}

1. Knowledge routing first — run and read the top hits:
   node ./scripts/knowledge/search-doc-catalog.mjs --query "${goal}" --agent orchestrator --stage discovery --limit 5
2. Locate the governing requirement per .cursor/rules/requirements-first-orchestration.mdc: check docs/requirements/REQUIREMENT_CENTER.md and docs/requirements/domain/*.md. Also check docs/tasks/TASK_CENTER.md for an active task doc (resume truth) and reuse it if the scope matches.
3. Classify requirement_status:
   - "confirmed": the domain doc / REQUIREMENT_CENTER marks this capability confirmed
   - "needs-confirmation": it exists but is draft / needs-confirmation (you MAY draft/repair the domain doc as needs-confirmation, but never promote it to confirmed)
   - "missing": no requirement exists yet
   - "ambiguous": exists but unclear or contradictory
Return requirement_path as "docs/requirements/domain/<x>.md (Fn)" or null, plus catalog_refs and any open_questions.`

const plannerPrompt = (goal, disc) => `PLANNING step. Writable boundary: docs/tasks/** only.

Goal: ${goal}
Requirement (confirmed): ${j(disc.requirement_path)}
Active task doc: ${j(disc.active_task_doc)}
Catalog refs: ${j(disc.catalog_refs)}

Create or repair the durable task doc under docs/tasks/** using docs/tasks/_template.md. Reuse the active task doc in place if it matches scope (ORCH-001). Fill: Requirement Alignment, [AC-*] acceptance criteria, Scope And Ownership (owned code paths), Acceptance mode, and the coder execution brief. Keep it small and execution-oriented.`

const coderPrompt = (goal, plan) => `IMPLEMENTATION step. Edit only owned paths; docs/tasks/** is read-only.

Goal: ${goal}
Task doc: ${j(plan.task_doc_path)}
Requirement: ${j(plan.requirement_path)}
Owned scope: ${j(plan.impacted_scope)}
Planned validation: ${j(plan.validation)}

Implement the scoped change. Run the narrowest useful validation (bun run verify is the composite gate; add bun run test:e2e / bun run lint per risk surface). After any schema edit: bun run prisma:validate + prisma:generate + typecheck. Do NOT run prisma:push or any irreversible database operation — that is a human gate.`

const fixPrompt = (coder, review) => `FIX step. Edit only owned paths; docs/tasks/** is read-only.

Task doc: ${j(coder.task_doc_path)}
The reviewer requested changes. Resolve every blocking/important finding:
${j((review.findings || []).filter(isBlocking))}

Re-run the relevant validation after fixing and report exactly what you changed.`

const reviewerPrompt = (coder) => `READ-ONLY REVIEW. You have no Edit/Write tools.

Task doc: ${j(coder.task_doc_path)}
Changed paths: ${j(coder.changed_paths)}
Validation already run: ${j(coder.validation_ran)}
Still-needed validation: ${j(coder.validation_needed)}

Find bugs, regressions, security/permission gaps, transaction/migration/data-consistency risk, module-boundary drift, and validation gaps. Run the narrowest useful validation to confirm the gate (bun run verify). Label each finding severity blocking|important|minor. Set status "approved" only if no blocking/important finding remains, otherwise "changes_requested".`

const acceptancePrompt = (plan, review) => `READ-ONLY ACCEPTANCE. Writable scope: the task doc ## Acceptance section, linked domain status, and docs/acceptance-tests/** only.

Task doc: ${j(plan.task_doc_path)}
Requirement: ${j(plan.requirement_path)}
Acceptance mode: ${j(plan.acceptance_mode)}
Reviewer evidence: ${j(review && review.evidence)}

Judge each [AC-*] from the task doc / linked domain capability as met|partially met|not met|blocked. Use .env.dev via: set -a && source .env.dev && set +a && <cmd>; never write to a shared prod/dev DB. Issue a final status: accepted|rejected|conditionally-accepted|blocked. Record the verdict in the task doc ## Acceptance section (and docs/acceptance-tests/** when a spec/run is warranted).`

// --- Orchestration ---

const goal = (args && args.goal) ?? args
if (!goal || typeof goal !== 'string') {
  return { error: 'no goal provided — call Workflow with args: { goal: "<requirement text or docs/requirements/domain/*.md (Fx)>" }' }
}

phase('Discovery')
const disc = await agent(discoveryPrompt(goal), {
  agentType: 'general-purpose', schema: DISCOVERY_SCHEMA, phase: 'Discovery', label: 'discovery',
})
if (!disc) return { error: 'discovery step did not return a result' }
log(`requirement_status=${disc.requirement_status} path=${disc.requirement_path ?? '-'}`)
if (disc.requirement_status !== 'confirmed') {
  // Human gate 1: requirements-first-orchestration.mdc — only the user promotes to confirmed.
  return { pause: 'requirement-needs-confirmation', requirement: disc.requirement_path, discovery: disc }
}

phase('Plan')
const plan = await agent(plannerPrompt(goal, disc), {
  agentType: 'saifute-planner', schema: PLANNER_SCHEMA, phase: 'Plan', label: 'planner',
})
if (!plan) return { error: 'planner step did not return a result', discovery: disc }

phase('Implement')
let coder = await agent(coderPrompt(goal, plan), {
  agentType: 'saifute-coder', schema: CODER_SCHEMA, phase: 'Implement', label: 'coder',
})
if (!coder) return { error: 'coder step did not return a result', task_doc: plan.task_doc_path }

phase('Review')
let round = 0
let review
while (true) {
  review = await agent(reviewerPrompt(coder), {
    agentType: 'saifute-code-reviewer', schema: REVIEWER_SCHEMA, phase: 'Review', label: `review:r${round}`,
  })
  if (!review) return { error: 'reviewer step did not return a result', task_doc: plan.task_doc_path }
  const blocking = (review.findings || []).filter(isBlocking)
  const needsFix = review.status === 'changes_requested' || blocking.length > 0
  if (!needsFix) break
  if (round >= 2) { log(`review still requesting changes after ${round} fix round(s) — escalating`); break }
  round++
  log(`fix round ${round}: ${blocking.length} blocking/important finding(s)`)
  coder = await agent(fixPrompt(coder, review), {
    agentType: 'saifute-coder', schema: CODER_SCHEMA, phase: 'Implement', label: `fix:r${round}`,
  })
  if (!coder) return { error: `fix round ${round} did not return a result`, task_doc: plan.task_doc_path, review }
}

const reviewUnresolved = review.status === 'changes_requested' && (review.findings || []).some(isBlocking)
if (reviewUnresolved) {
  return { pause: 'review-unresolved', requirement: plan.requirement_path, task_doc: plan.task_doc_path, review }
}

phase('Accept')
const accept = await agent(acceptancePrompt(plan, review), {
  agentType: 'saifute-acceptance-qa', schema: ACCEPT_SCHEMA, phase: 'Accept', label: 'acceptance',
})
if (!accept) return { error: 'acceptance step did not return a result', task_doc: plan.task_doc_path, review }

return {
  requirement: plan.requirement_path ?? disc.requirement_path,
  task_doc: plan.task_doc_path,
  fix_rounds: round,
  acceptance: accept,
  next: 'human gate: commit / prisma:push / release remain manual',
}
