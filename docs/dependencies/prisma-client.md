# @prisma/client

## Local Version Snapshot

- Primary package: `@prisma/client`
- Related packages: `prisma`, `@prisma/adapter-mariadb`
- `package.json` range: `@prisma/client: ^7.5.0`, `prisma: ^7.5.0`, `@prisma/adapter-mariadb: ^7.5.0`
- Lockfile version: `@prisma/client: 7.5.0`, `prisma: 7.5.0`
- Repo touchpoints: `prisma/schema.prisma`, `src/shared/prisma/prisma.service.ts`, `generated/prisma/`
- Last refreshed: `2026-03-15 (local snapshot only)`
- Refresh status: `seed-only, pending Context7 enrichment`

## Context7 Resolve Result

- Library search name: `Prisma`
- Resolve query: `Prisma 7.5 client transactions adapter mariadb generated client usage`
- Selected library ID: `pending first Context7 resolve`
- Selected library name: `pending first Context7 resolve`
- Description: `pending first Context7 resolve`
- Source reputation: `pending first Context7 resolve`
- Benchmark score: `pending first Context7 resolve`
- Snippet count: `pending first Context7 resolve`
- Available versions: `pending first Context7 resolve`
- Selection reason: `Seeded from local dependency data; needs first Context7 resolve to lock the canonical Prisma library entry and version scope.`

## Context7 Query Record

- Library ID used: `pending first Context7 resolve`
- Query used: `What is the recommended Prisma 7.5 usage for a NestJS service extending PrismaClient with MariaDB adapter and callback transactions?`
- Version scope requested: `Prisma 7.5`
- Retrieved date: `pending first Context7 query`
- Supporting references: `optional after Context7 verification or manual official-doc confirmation`

## Recommended APIs

### Centralize Prisma connection lifecycle in one service

- Recommended API: `PrismaClient` wrapped by a NestJS service implementing `OnModuleInit` and `OnModuleDestroy`
- Why this is preferred: `The repository already centralizes connection startup, shutdown, and adapter selection in a shared Prisma service.`
- Minimal pattern:

```ts
@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- Notes for this repo: `This is a repo-baseline pattern captured from current code; verify with Context7 before treating it as the preferred external API recommendation. Keep Prisma adapter setup and transaction helpers inside src/shared/prisma/prisma.service.ts rather than scattering client construction across modules.`

### Prefer callback transactions for service-level orchestration

- Recommended API: `prisma.$transaction(async (tx) => { ... })`
- Why this is preferred: `This keeps repository work scoped to one transaction client and matches the existing runInTransaction() helper design.`
- Minimal pattern:

```ts
await prisma.$transaction(async (tx) => {
  await tx.user.create({ data: { name: "demo" } });
});
```

- Notes for this repo: `This is a repo-baseline pattern captured from current code; verify with Context7 before treating it as the preferred external API recommendation. Route service-layer multi-step writes through the shared transaction helper so modules do not invent their own transaction conventions.`

## Deprecated Or Avoid

- API or pattern: `Constructing new PrismaClient instances inside feature modules`
- Status: `avoid in this repo`
- Replacement: `Inject and reuse the shared PrismaService`
- Why to avoid: `Multiple ad hoc clients break lifecycle ownership and make adapter, logging, and transaction behavior inconsistent.`

## Repo Usage Notes

- Current local conventions: `The repo generates Prisma client output under the root-level generated/prisma directory (gitignored) and uses a MariaDB adapter in the shared Prisma service.`
- Wrappers or abstractions in this repo: `PrismaService.runInTransaction()` wraps callback transactions for callers.`
- Known gaps or TODOs: `Fill Context7 resolve metadata and verify any Prisma 7.5 guidance around adapters, transactions, and generated client imports before reusing this note as an authoritative API reference.`

## Refresh Triggers

- `@prisma/client`, `prisma`, or `@prisma/adapter-mariadb` version changed
- Transaction guidance changed
- Generated client output or adapter usage changed
- Context7 resolves a different canonical Prisma docs entry

## Refresh Checklist

- [ ] Re-check `package.json` and `pnpm-lock.yaml`
- [ ] Re-run Context7 resolve step for `Prisma`
- [ ] Re-run Context7 docs query for the needed Prisma 7.5 topic
- [ ] Update recommended and deprecated sections
- [ ] Reconfirm repo-specific notes in `prisma/schema.prisma` and `src/shared/prisma/prisma.service.ts`
