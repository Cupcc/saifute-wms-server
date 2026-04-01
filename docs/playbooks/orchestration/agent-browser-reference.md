# agent-browser Reference

Verified on `2026-04-02`.

This note explains how agents in this repository should use `agent-browser` for browser-based testing and acceptance work.

## Upstream Reference

There is an external GitHub tutorial that matches the workflow validated here:

- Vercel Labs `agent-browser` README:
  - Quick start: [github.com/vercel-labs/agent-browser#quick-start](https://github.com/vercel-labs/agent-browser#quick-start)
  - Agent instructions section: [github.com/vercel-labs/agent-browser#agentsmd--claudemd](https://github.com/vercel-labs/agent-browser#agentsmd--claudemd)

That tutorial describes the same core pattern:

1. open a page
2. get a snapshot of interactive elements
3. interact using snapshot references
4. re-snapshot after page changes

Our repository should follow that same pattern directly through the `agent-browser` CLI.

Use the CLI directly, especially these commands:

- `open`
- `snapshot`
- `fill`
- `click`
- `press` / `keyboard type`
- `wait`
- `network requests`
- `network request`
- `screenshot`

## When To Use It

Use `agent-browser` whenever the task needs real browser behavior, for example:

- login and route-entry smoke tests
- browser-side acceptance for user flows
- page rendering or visible-action checks
- network evidence for browser-triggered API calls
- reproducing a UI bug that cannot be confirmed from code or API tests alone

Do not mix `agent-browser` evidence with ad hoc manual Chrome steps in the same acceptance conclusion unless the task doc explicitly records that exception.

## Verified Working Flow

The following flow was validated in this environment.

### 1. Open Or Reuse A Page

- Use `agent-browser open <url>` to navigate the active session.
- Use `--session <name>` to isolate one task from another.
- Reuse the same session when you want page state, refs, cookies, or browser history to persist.

### 2. Snapshot Before Interacting

- Always call `agent-browser snapshot` before clicking or filling.
- Prefer snapshot refs like `@e2`, `@e3`, not guessed CSS selectors.
- After navigation or a DOM refresh, run `snapshot` again because old refs may no longer be valid.

### 3. Drive The UI

- Use `fill @ref "value"` for inputs.
- Use `click @ref` for buttons, links, and toggles.
- Use `press` or `keyboard type` only when direct `fill` is not enough.
- Use `wait --text "..."` or another wait mode to confirm the expected result before concluding the check passed.

### 4. Capture Browser Evidence

- Use `network requests` to see the request list for the current page.
- Use `network request <id>` to inspect a specific request entry.
- Use `screenshot <path>` when visual evidence is useful for the task doc or handoff.

## Smoke Validation Performed

Two live checks were run while preparing this reference.

### DOM Interaction Smoke

- Opened a `data:` page containing a username field, password field, login button, and result text.
- Ran `agent-browser --session codex-verify snapshot -i --json` and received stable refs:
  - `e2` -> `Login`
  - `e3` -> `Username`
  - `e4` -> `Password`
- Ran:
  - `fill @e3 'agent-smoke'`
  - `fill @e4 'secret123'`
  - `click @e2`
  - `wait --text 'Login OK for agent-smoke'`
  - `eval 'document.body.innerText'`
- The final body text was:
  - `Agent Browser CLI Smoke\nUsername Password Login\nLogin OK for agent-smoke`

Conclusion: `agent-browser` can successfully open a page, snapshot DOM, fill fields by ref, click controls by ref, wait on visible results, and read page state.

### Navigation And Network Smoke

- Navigated to `https://example.com`.
- Ran:
  - `open https://example.com`
  - `wait --load networkidle`
  - `snapshot -i`
  - `network requests`
  - `screenshot /Users/sft/Projects/saifute-wms-server-nestjs/.tmp-agent-browser-cli-example.png`
- Snapshot showed:
  - heading `Example Domain` -> `e1`
  - link `Learn more` -> `e2`
- `network requests` showed:
  - `GET https://example.com/ (Document) 200`
  - `GET https://example.com/favicon.ico (Other) 404`
- `network request <id>` was also callable and returned the selected request URL.

Conclusion: `agent-browser` can provide browser-side navigation, wait conditions, request listings, per-request inspection, and screenshots.

## Recommended Testing Pattern

For browser-based task verification, use this order:

1. Ensure the target environment is reachable.
2. Open the page with `agent-browser --session <name> open <url>`.
3. Run `agent-browser --session <name> snapshot -i` or `snapshot -i --json`.
4. Interact using snapshot refs like `@e2`.
5. Confirm UI result with `wait`.
6. Inspect network requests when the check depends on API success.
7. Save a screenshot only when the visual state matters.
8. Record the exact page, account, scenario, and evidence in the task or acceptance doc.

## Evidence Template

When writing browser evidence into a task or acceptance run, keep it concrete:

- environment: base URL and relevant backend URL
- account: which user was used
- pages or routes covered
- visible result observed
- key request URLs and status codes
- whether screenshots were captured

Avoid vague statements like `browser smoke passed` without naming the checked routes or evidence.

## Troubleshooting

### Browser Profile Already In Use

If the CLI reports socket or daemon startup failures such as:

- `Daemon failed to start`
- `Failed to bind socket: Address already in use`

first check whether a stale `agent-browser` daemon is still holding the session socket. In this environment, the following diagnosis worked:

```bash
ps -ax -o pid=,command= | rg 'agent-browser'
lsof -U | rg '\.agent-browser/.*\.sock|agent-browser'
```

When a stale daemon was found on `/Users/sft/.agent-browser/codex-verify.sock`, killing that daemon process fixed the issue:

```bash
kill <stale-agent-browser-pid>
```

Then retry the CLI command.

Do not treat this as a generic browser kill recipe. The target should be the stale `agent-browser` daemon that owns the socket.

### Do Not Run Same Session In Parallel

Do not launch multiple `agent-browser` commands concurrently against the same `--session`.

During verification, launching `click`, `wait`, and `eval` at the same time against `--session codex-verify` caused them to block until the earlier command finished.

Safe pattern:

- one active command at a time per session
- if you need parallel work, give each independent flow its own `--session <name>`

### Snapshot IDs Drifted

If a click or fill suddenly fails after a route change or modal open:

- rerun `snapshot`
- use the new `@e*` refs

Do not reuse stale `@e*` refs across major DOM changes.
