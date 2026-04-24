# Saifute WMS NestJS — Agent Guidelines

## Project Overview

Saifute WMS is a NestJS backend for warehouse management.

Core stack:

- Runtime/package manager: Bun
- Framework: NestJS
- ORM: Prisma
- Database: MariaDB
- Tests: Jest
- Formatter/linter: Biome
- Frontend workspace: `web/`

## Working Agreements

- Prefer `bun` for package scripts and runtime commands.
- Prefer `rg` / `rg --files` for search.
- Keep changes minimal and focused on the requested task.
- Do not rewrite unrelated modules while fixing a local issue.
- Do not commit, push, or create branches unless explicitly asked.
- Do not add new dependencies unless there is a clear need and existing utilities cannot solve the problem.

## Architecture Rules

Follow the existing modular layered structure:

- `controllers`: HTTP boundary, request/response orchestration only.
- `application`: use cases, workflow coordination, transaction orchestration.
- `domain`: business rules, domain models, invariants.
- `infrastructure`: Prisma, database access, external systems, persistence adapters.
- `dto`: request/response DTOs and validation.

Keep business rules out of controllers and Prisma-specific details out of domain code.

## NestJS Conventions

- Use dependency injection instead of manually constructing services.
- Keep providers small and module-scoped where possible.
- Prefer explicit DTO validation with `class-validator`.
- Keep transaction boundaries in application/infrastructure layers, not controllers.
- Preserve existing naming, folder layout, and test style.

## Prisma Rules

- Treat `prisma/schema.prisma` as a high-impact file.
- After Prisma schema changes, run or suggest:
  - `bun run prisma:validate`
  - `bun run prisma:generate`
  - `bun run typecheck`
- Do not run destructive database operations unless explicitly requested.
- Prefer dry-run migration scripts before execute scripts.

## Validation Commands

Use the narrowest useful validation first:

- Type check: `bun run typecheck`
- Unit tests: `bun run test`
- E2E tests: `bun run test:e2e`
- Lint/check: `bun run lint`
- Full verification: `bun run verify`
- Migration type check: `bun run migration:typecheck`

When changing frontend code under `web/`, use the workspace’s own scripts from `web/package.json`.

## Documentation Index

Use these docs before making broad architectural changes:

- Architecture: `docs/architecture/README.md`
- Requirements: `docs/requirements/README.md`
- Acceptance tests: `docs/acceptance-tests/README.md`
- Playbooks: `docs/playbooks/README.md`
- Task notes: `docs/tasks/README.md`
- Dependency notes: `docs/dependencies/README.md`

## Code Quality Expectations

- Prefer simple, readable code over clever abstractions.
- Keep files reasonably sized and cohesive.
- Add or update tests when behavior changes and an adjacent test pattern exists.
- Update docs when changing public behavior, workflows, commands, or architectural conventions.
- Avoid inline comments unless they explain non-obvious domain decisions.

## Safety Rules

- Never expose or commit secrets from `.env*` files.
- Do not modify generated files unless the project convention requires it.
- Do not perform production/staging data migrations without explicit user approval.
- Do not silence TypeScript, lint, or test failures with broad ignores.
