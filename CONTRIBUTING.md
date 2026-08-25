# Contributing to Omni AI

Agent/human contributors alike: `AGENTS.md` is the technical handbook (architecture, message protocol,
storage contract, checklists) and `docs/dev-tooling.md` documents the toolchain. This file covers HOW we work.
Work lands via our GitFlow-lite branch model (`feature/*` → `develop` → `master`;
see [Branching Model](#branching-model-gitflow-lite) below).

## Skills Are Mandatory

Superpowers process skills are symlinked at `.claude/skills/` + `.agents/skills/`. Every session starts
with `using-superpowers` and follows AGENTS.md § Skills Protocol (brainstorming → features,
systematic-debugging → bugs, TDD → implementation, verification-before-completion → done claims).

## Code Conventions

- Vanilla ES modules only — no frameworks, no bundler (see AGENTS.md Core Directives)
- Style enforced by ESLint + Prettier (`npm run lint`); formatting via `npx prettier --write <files>`
- Types: annotate new/changed functions with JSDoc; `npm run typecheck` must stay green
- Storage areas are a contract: prefs → `chrome.storage.sync`, secrets/config → `chrome.storage.local`
- Any async `onMessage` reply must `return true`
- User-facing strings go through `_locales/*/messages.json` (add to `en` first)

## Commit Convention (Conventional Commits)

`feat|fix|chore|docs|style|refactor|test: imperative summary` — e.g. `fix(content): preserve newlines in textarea replace`.
Prompt-wording changes in `lib/ai-service.js` MUST update `tests/lib/ai-service.test.js` in the SAME commit.

## Testing Policy

- Unit: Jest + jest-chrome (`npm test`) — required for `lib/` and `background/` changes
- E2E: Playwright (`npm run e2e`) — required for content-script UI behavior changes
- Before opening a PR: `npm run verify` green locally

## PR Checklist

- [ ] `npm run verify` green
- [ ] New UI renders inside the Shadow DOM root using existing CSS tokens
- [ ] Manual smoke per AGENTS.md checklist when touching content scripts

## Branching Model (GitFlow-lite)

- `master` — production only. Every commit here is tagged `vX.Y.Z`. Protected.
- `develop` — integration branch. Always shippable.
- `feature/<short-name>` — cut FROM develop, PR back INTO develop.
- `fix/<short-name>` — same as feature/ for bugfixes.
- `release/vX.Y.Z` — cut FROM develop when version-up time (bump manifest/package + CHANGELOG),
  PR INTO master, then tag. Merge-back the release commit into develop.
- `hotfix/<desc>` — critical fix cut FROM master, PR INTO master, tag patch bump,
  then merge back into develop.

Rules:

1. Never commit directly to `master` or `develop` — PRs only.
2. Squash-merge is fine for feature branches; merge commits for releases.
3. Version bumps happen ONLY in release/hotfix branches (Keep-a-Changelog CHANGELOG.md updated there).
4. Tags (`v2.2.0`…) trigger `.github/workflows/release.yml` (packaging + GitHub Release).

Release mechanics (version-bump checklist, `bash scripts/publish.sh`, Chrome Web Store upload) live in
**AGENTS.md § Release Flow**; this section defines WHERE those steps happen.
