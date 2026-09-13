# Contributing to Omni AI

Agent/human contributors alike: `AGENTS.md` is the technical handbook (architecture, message protocol,
storage contract, checklists) and `docs/DEV-TOOLING.md` documents the toolchain. This file covers HOW we work.
Work lands on `master` via short-lived feature branches (`feature/*` or `fix/*`);
see [Branching Model](#branching-model) below.

## Skills Are Mandatory

Superpowers process skills are symlinked at `.claude/skills/` + `.agents/skills/`. Every session starts
with `using-superpowers` and follows AGENTS.md § Skills Protocol (brainstorming → features,
systematic-debugging → bugs, TDD → implementation, verification-before-completion → done claims).

## Code Conventions

- Vanilla ES modules only, no frameworks, no bundler (see AGENTS.md Core Directives)
- Style enforced by ESLint + Prettier (`npm run lint`); formatting via `npx prettier --write <files>`
- Types: annotate new/changed functions with JSDoc; `npm run typecheck` must stay green
- Storage areas are a contract: prefs → `chrome.storage.sync`, secrets/config → `chrome.storage.local`
- Any async `onMessage` reply must `return true`
- User-facing strings go through `_locales/*/messages.json` (add to `en` first)
- Language _names_ are the one exception: they live in `lib/languages.js`, not in `_locales`. That registry is reference data (43 codes, each with an English and a native name) read by the Settings pickers, the LLM prompts and the overlay labels. UI copy around those pickers, such as the search placeholder and the optgroup labels, still needs `_locales` keys.

## Commit Convention (Conventional Commits)

`feat|fix|chore|docs|style|refactor|test: imperative summary`, for example `fix(content): preserve newlines in textarea replace`.
Prompt-wording changes in `lib/ai-service.js` MUST update `tests/lib/ai-service.test.js` in the SAME commit.

## Testing Policy

- Unit: Jest 30 + jsdom with the repo-owned chrome mock (`tests/helpers/chrome-mock.js`, `npm test`), required for `lib/` and `background/` changes
- E2E: Playwright (`npm run e2e`), required for content-script UI behavior changes
- Before opening a PR: `npm run verify` green locally

## Editor Support Matrix

Run this matrix manually after changing content scripts. Each site must keep Copy available if direct replacement is rejected.

| Site                    | Selected replace | Full-draft replace | Shortcut routing | Copy fallback |
| ----------------------- | ---------------- | ------------------ | ---------------- | ------------- |
| TinyMCE 6/7 iframe demo | Required         | Required           | Required         | Required      |
| Discord                 | Required         | Required           | Required         | Required      |
| Telegram Web            | Required         | Required           | Required         | Required      |
| Slack                   | Required         | Required           | Required         | Required      |
| Microsoft Teams         | Required         | Required           | Required         | Required      |

## PR Checklist

- [ ] `npm run verify` green
- [ ] New UI renders inside the Shadow DOM root using existing CSS tokens
- [ ] Manual smoke per AGENTS.md checklist when touching content scripts
- [ ] If the change moves a feature, a keyboard shortcut, a permission or a language count, update `docs/CHROME_WEBSTORE_LISTING.txt` and `docs/PERMISSION_JUSTIFICATIONS.txt` in the same PR

## Branching Model

- `master`: production only, and the only long-lived branch. Protected, so a PR
  can only merge when both CI checks (`verify` and `e2e (playwright)`) are green
  and the branch is up to date. Every release is tagged `vX.Y.Z`.
- `feature/<short-name>`: cut FROM `master`, PR back INTO `master`.
- `fix/<short-name>`: same as `feature/*`, for bugfixes.

Rules:

1. Never commit directly to `master`, with one exception: the release commit
   (version bump plus `CHANGELOG.md` and the README badge) is committed straight
   to `master` before the tag, exactly as AGENTS.md § Release Flow describes.
2. Squash-merge is fine for feature branches.
3. There is no `develop` branch in this repository. An earlier revision of this
   file described an integration branch plus `release/*` and `hotfix/*`
   branches; none of them exist. AGENTS.md § Release Flow is the authority on
   how a release is cut today.
4. Tags (`vX.Y.Z`) trigger `.github/workflows/release.yml` (packaging plus the
   GitHub Release).

Release mechanics (version-bump checklist, `bash scripts/publish.sh`, Chrome Web Store upload) live in
**AGENTS.md § Release Flow**. Store-facing documents to keep in sync are listed
there too, in step 4.
