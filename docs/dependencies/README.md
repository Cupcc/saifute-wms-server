# Dependency Docs

This directory stores refreshable local dependency notes for libraries used by this repository.

Purpose:

- Reduce repeated Context7 or web lookups for high-frequency dependencies.
- Keep local notes aligned with the real Context7 workflow so refreshes stay fast and reproducible.
- Separate durable workflow rules from refreshable dependency snapshots.

Authority order:

1. Confirm local versions in `package.json`, `pnpm-lock.yaml`, and related config first.
2. Use `docs/dependencies/*.md` only when the file already covers the dependency, version, and API topic and its `Refresh status` shows Context7 verification is complete.
3. Refresh with Context7 when the local file is missing, stale, missing the needed topic, or still marked `pending` or `seed-only`.
4. Use official web docs only when Context7 does not cover the dependency or when migration details need confirmation.

Recommended filename pattern:

- One file per dependency or tightly-coupled dependency stack.
- Use lowercase kebab-case slugs.
- Examples:
- `@nestjs/swagger` -> `docs/dependencies/nestjs-swagger.md`
- `@prisma/client` + `prisma` -> `docs/dependencies/prisma-client.md`
- `winston` + `nest-winston` -> `docs/dependencies/winston.md`

Required structure:

- `## Local Version Snapshot`
- `## Context7 Resolve Result`
- `## Context7 Query Record`
- `## Recommended APIs`
- `## Deprecated Or Avoid`
- `## Repo Usage Notes`
- `## Refresh Triggers`
- `## Refresh Checklist`

Context7 alignment rules:

- `Context7 Resolve Result` should capture the reusable fields returned by `resolve-library-id`, including the selected `libraryId`, library name, description, snippet count, source reputation, benchmark score, available versions, and selection reason.
- `Context7 Query Record` should capture the inputs needed to rerun `query-docs`, including `libraryId`, query text, version scope, and retrieval date.
- If you manually confirm official docs or source URLs outside the strict resolve/query contract, record them as optional supporting references rather than required Context7 fields.
- Do not paste large raw responses into the file. Normalize them into the stable headings above so the file stays diff-friendly.

Refresh triggers:

- A dependency version changed in `package.json` or `pnpm-lock.yaml`.
- A new API topic is needed and the file does not cover it.
- Context7 shows a deprecation, replacement, or breaking change.
- The selected Context7 `libraryId` changed after a new resolve step.

Refresh workflow:

1. Confirm the dependency version from `package.json` and `pnpm-lock.yaml`.
2. Open the existing dependency doc or create a new one from `docs/dependencies/_template.md`.
3. Fill or refresh `Local Version Snapshot`.
4. Re-run the Context7 resolve step and update `Context7 Resolve Result`.
5. Re-run the Context7 docs query and update `Context7 Query Record`.
6. Update `Recommended APIs`, `Deprecated Or Avoid`, and `Repo Usage Notes`.
7. Update `Last refreshed` and `Refresh status`.

Maintenance rules:

- Keep durable workflow guidance in `.cursor/rules/*.mdc`.
- Keep refreshable dependency facts in `docs/dependencies/*.md`.
- If a dependency note only has local version data and no confirmed Context7 result yet, mark `Refresh status` as `seed-only` or `pending Context7 enrichment`.
- Seed-only notes are useful as local touchpoint inventories, but they are not authoritative API references until the Context7 fields have been verified.
