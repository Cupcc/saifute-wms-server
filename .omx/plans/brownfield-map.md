# Brownfield Map

## 2026-04-10 Semantic Refactor

- Scope: rename the historical RD runtime from ambiguous `project` / `rd-allocation` wording to explicit `rd-project`; rename the external-facing project semantic from `customer project` to `sales project`.
- Keep: the existing `customer` module name and route family remain canonical for customer outbound / sales return transactions.
- Change:
  - Prisma logical models, enums, table names, and migration scripts that still describe the RD runtime as `project` or `rd-allocation`
  - backend module names, permission paths, menu routes, and AI/current-truth references
  - frontend route segments and labels that still expose `allocations`
  - documentation truth sources and historical evidence file names that still imply sales project and RD are the same concept

## Must-Preserve Invariants

- `rdProject` remains the only current runtime behind RD project master/BOM/material-action behavior.
- `salesProject` stays separated from RD and does not directly mutate stock.
- Real stock decreases for external fulfillment still flow through the `customer` module.
- Generic FIFO/source `allocations` terminology inside inventory costing is not a rename target.

## Risky Subsystems

- `prisma/schema.prisma` and generated Prisma client
- `scripts/migration/rd-project/**` because target physical table names are part of the contract
- route/menu synchronization across `prisma/system-management.seed.ts`, RBAC defaults, and frontend permission maps
- current-truth docs and archived acceptance/task artifacts that still reference `project-management.md`

## Recommended Path

1. Finish runtime contract rename first: schema, routes, permissions, frontend entry paths.
2. Rename physical RD tables in migration scripts from `project*` to `rd_project*`.
3. Rename current-truth docs to `sales-project` and historical RD evidence to `rd-project`.
4. Regenerate Prisma client and run focused verification.
