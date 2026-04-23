# Contributing

This repository uses a lightweight team workflow with `main` as the only
long-lived branch.

## Branches

- `main`: the only long-lived branch and the source of truth
- short-lived branches: feature, fix, chore, or refactor branches created from
  the latest `origin/main`

## Daily Development

- Start each task from the latest `origin/main`.
- Create a short-lived branch for the task, such as
  `feature/monthly-reporting` or `fix/login-timeout`.
- Open a PR back into `main` when the work is ready.
- Keep changes scoped to one main goal when practical, but do not over-split
  work during heavy development.

## Pull Requests To Main

- `main` should normally be updated through pull requests.
- PRs targeting `main` must use a Conventional Commits title.
- Use the repository pull request template.
- Before opening or merging a PR, sync the branch with the latest
  `origin/main` by rebasing or merging.

Examples:

- `feat(reporting): add monthly reporting filters`
- `fix(auth): handle expired refresh token`
- `chore(ci): simplify main branch checks`

## Sync With Main

Because `main` is the only long-lived branch, there is no extra branch
promotion step. Keep your working branch current with `origin/main` before
requesting review or merging.

Recommended commands:

```bash
git checkout feature/my-task
git fetch origin
git rebase origin/main
git push --force-with-lease
```

## Why This Exists

- Keep one clear integration branch for the whole team.
- Remove branch sync overhead and history divergence.
- Keep `main` stable, reviewable, and easy to release from.
