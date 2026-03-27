# System Readiness Legacy Monitor Coverage

## Metadata

- Scope: expand `system-readiness` from reporting smoke validation into the legacy `monitor/*` pages by wiring the frontend to current NestJS audit/session/scheduler contracts
- Related requirement: `docs/requirements/archive/retained-completed/req-20260325-2319-system-readiness-validation.md`
- Status: `completed`
- Review status: `parent-validated`
- Lifecycle disposition: `retained-completed`
- Last updated: `2026-03-26`

## Summary

- Restored frontend reachability for `/monitor/online`, `/monitor/logininfor`, `/monitor/operlog`, `/monitor/job`, and `/monitor/job-log/index/0`.
- Replaced removed legacy `/monitor/*` backend calls with compatibility adapters onto current NestJS monitor/session/audit/scheduler endpoints.
- Added the minimal scheduler read support needed by the legacy job page and explicitly contained unsupported monitor actions instead of leaving opaque failures.

## Validation

- `pnpm swagger:metadata && pnpm typecheck` — passed
- `pnpm --dir web build:prod` — passed
- Focused biome check on touched files — passed without blocking issues
- Browser smoke — passed for `/monitor/online`, `/monitor/logininfor`, `/monitor/operlog`, `/monitor/job`, `/monitor/job-log/index/0`; each primary request returned `200`

## Outcome

- Legacy `monitor/*` coverage is closed for the scoped readiness pass.
- Residual non-blocking gaps were intentionally left out of scope: `server/cache` legacy monitor pages, broader `base/*` recovery, and navbar websocket warning noise.
