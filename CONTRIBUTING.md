# Contributing

This repository uses a main-only workflow with linear history.

## Branches

- `main`: the only long-lived branch and the source of truth
- short-lived task branches: create feature, fix, chore, or refactor branches
  from the latest `origin/main`

## Daily Development

- Start each task from the latest `origin/main`.
- Create a short-lived branch for the task, such as
  `feature/monthly-reporting` or `fix/login-timeout`.
- Keep changes scoped to one main goal when practical.
- Rebase your branch onto the latest `origin/main` before requesting review
  and again before merge when needed.

## Pull Requests To Main

- `main` should normally be updated through pull requests.
- PRs targeting `main` must use a Conventional Commits title.
- Use the repository pull request template.
- Keep the PR branch rebased onto the latest `origin/main`.
- The repository keeps `main` linear. On GitHub, this is enforced with
  `Rebase and merge` only. Do not rely on squash merges or merge commits.

Examples:

- `feat(reporting): add monthly reporting filters`
- `fix(auth): handle expired refresh token`
- `chore(ci): simplify main branch checks`

## Sync With Main

Keep your working branch current with `origin/main` before requesting review
or merging.

Recommended commands:

```bash
git fetch origin
git switch -c feature/my-task origin/main

# ...work, commit...

git fetch origin
git rebase origin/main
git push --force-with-lease
```

## Why This Exists

- Keep one clear integration branch for the whole team.
- Preserve real commit ancestry instead of hiding it behind squash commits.
- Keep `main` linear, reviewable, and easier to audit.
