# Architecture Documentation

This directory is the canonical home for all Saifute WMS NestJS repository architecture documentation.

## Layout

| Path | Purpose |
| ---- | ------- |
| `00-architecture-overview.md` | Module inventory, target tech stack, code structure conventions, shared infrastructure map, frozen semantic constraints, and module dependency graph. Start here before touching any module. |
| `20-wms-database-tables-and-schema.md` | Frozen database-table and schema baseline for shared core plus transaction families, together with the related domain-flow and state semantics. Read this before implementing or migrating any document-flow, inventory, or audit surface. |
| `21-database-field-dictionary.md` | Complete field-level dictionary for every database table — column name, data type, nullability, default, and business meaning. Companion to `20-*` for implementation-time reference. |
| `30-java-to-nestjs-data-migration-reference.md` | Canonical legacy Java -> NestJS migration reference. Explains old table groups, target table groups, domain-by-domain mapping, replay-vs-copy rules, staging/archive handling, and cutover terminology. |
| `modules/` | Per-module architecture references — one file per NestJS module. Each file describes the module's boundaries, responsibilities, data access rules, and cross-module constraints. |

## Recommended Reading Order

0. `docs/requirements/PROJECT_REQUIREMENTS.md` — start here to understand why the system exists and what target scope is required; this is the user-confirmed requirement baseline for all architecture and implementation decisions
1. `docs/architecture/00-architecture-overview.md` — module map, frozen semantic constraints, and module dependency graph; read this before the flow/schema baseline to orient the full picture
2. `docs/architecture/20-wms-database-tables-and-schema.md` — frozen database-table and schema baseline for shared core plus transaction families, together with the related domain-flow and state semantics
3. `docs/architecture/21-database-field-dictionary.md` — complete field-level dictionary for every table; use alongside `20-*` when implementing or reviewing schema-level code
4. `docs/architecture/30-java-to-nestjs-data-migration-reference.md` — old-to-new migration reference and cutover vocabulary; required only for migration, backfill, or legacy-data work
5. Per-module file under `docs/architecture/modules/<module>.md` — module-specific boundaries, responsibilities, current implementation maturity, and cross-module constraints

## Notes

- `docs/architecture/**` is the single canonical architecture-doc root. Do not add architecture content outside this subtree.
- Module docs describe architecture and boundaries only; per-task execution plans live under `docs/tasks/**`.
- Technical dependency order belongs in architecture docs only when it is a lasting structural constraint. Do not turn optional implementation preferences into hard architecture rules.
- The database-table and schema doc is a frozen baseline. Changes to it require explicit user confirmation and a dedicated task doc.
- For migration, backfill, or cutover work, treat `00-architecture-overview.md` + `20-wms-database-tables-and-schema.md` + `30-java-to-nestjs-data-migration-reference.md` as the architecture baseline, and confirm runtime-table vs staging-table boundaries against `prisma/schema.prisma` plus the migration staging SQL before planning or executing data movement.
- **Current vs. target (review lens)**: when reading or updating a module doc under `docs/architecture/modules/`, treat the distinction between current implementation and target architecture as a required lens. Where a module's current code surface is narrower than the target scope in `PROJECT_REQUIREMENTS.md`, the module doc should note that gap explicitly rather than silently implying current code already satisfies the target. `project.md`, `reporting.md`, and `master-data.md` have been explicitly updated with this distinction; other module docs may still need similar clarification in future passes.

## Revision Guidance

- Update the relevant architecture doc in the same delivery scope when code changes alter module boundaries, shared infrastructure contracts, canonical directory structure, or frozen domain semantics already documented here.
- Use `docs/tasks/**` to capture execution history, review notes, migration steps, and temporary rollout detail. When a task closes, keep only the lasting architectural truth in `docs/architecture/**`.
- Treat `20-wms-database-tables-and-schema.md` and any frozen constraints in `00-architecture-overview.md` as controlled baselines: changing them requires explicit user confirmation and a dedicated task doc.
- Module files under `docs/architecture/modules/*.md` may be revised in place by the task that changes that module's boundaries or cross-module contract; do not open a separate archive track just to preserve superseded wording.
- If architecture text becomes obsolete, update or remove the stale section in the current canonical file and keep provenance in the related task doc instead of leaving parallel outdated copies under `docs/architecture/**`.
