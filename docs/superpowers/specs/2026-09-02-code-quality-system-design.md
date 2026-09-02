# Design: Code Quality System (CI, lint rigor, architecture enforcement)

**Status:** Approved by user, pending spec file review
**Author:** Claude (brainstorming session with ddtcorex)
**Date:** 2026-09-02

## Goal

Tighten Omni AI's existing CI/lint/test setup into a genuinely strict quality
gate, and add automated enforcement for the architectural conventions that
today live only as prose in `AGENTS.md` (Provider Pattern, Storage Map
contract). Also improve test-coverage honesty and floor-setting so coverage
numbers reflect the real codebase instead of only the files Jest happens to
`require`.

## Why — this repo is maintained primarily by AI agents

This is the driving constraint for every decision below. When the primary
contributor is an AI agent (this session included) rather than a human
working from memory of past PRs, a documented convention that isn't
mechanically enforced is a convention that *will* eventually be violated —
not from carelessness, but because an agent session starts fresh each time
and can only be as reliable as the context it's given plus what it verifies.
CI is the one gate that cannot be skipped by a fresh session forgetting
something `AGENTS.md` said. Consequently this spec prioritizes **objective,
mechanical checks over reviewer judgment calls** wherever an objective check
is feasible, and is explicit about where it *isn't* feasible rather than
overclaiming automation.

## Evidence (repo state as of 2026-09-02, all verified by running the actual tools)

- CI already exists and is already a blocking gate: `.github/workflows/
  ci.yml` has a `verify` job (`npm run verify` = typecheck + lint + jest,
  the job id itself is the required branch-protection check name) and an
  `e2e` job (Playwright). This is not a from-scratch build.
- `eslint.config.js` has exactly three rules, **all at `"warn"` severity**:
  `no-unused-vars`, `no-var`, `eqeqeq`. `package.json`'s `"lint": "eslint ."`
  passes no `--max-warnings` flag. Result: `npx eslint . --max-warnings 0`
  currently exits 0 (the repo is genuinely clean today), but nothing stops
  a future warning from merging, since plain `eslint .` exits 0 on warnings
  regardless of count.
- `web-ext lint` exists as an npm script (`lint:webext`) but is **not
  invoked anywhere in `ci.yml`** — manifest/CSP/web-store-policy validation
  currently only happens if someone remembers to run it by hand.
- `.prettierrc.json` exists and `eslint-config-prettier` is wired in to
  disable conflicting stylistic ESLint rules, but **no script anywhere runs
  `prettier --check`** — nothing in CI actually verifies files are
  formatted; Prettier is configured as "the formatter" but not enforced.
- No `.github/dependabot.yml`, no `CODEOWNERS`, no PR template.
- `jest.config.js` sets no `collectCoverageFrom`, so Jest's coverage report
  only includes files some test file actually `require`s. Reported overall
  coverage today: 64.79% statements / 55.17% branches / 53.89% functions /
  65.98% lines — but this excludes `content.js` (the largest and most
  frequently-buggy file in the repo, ~2000 lines) and `sidepanel.js`
  entirely, since no Jest test imports either. Re-running with an explicit
  `collectCoverageFrom` covering the whole repo (excluding `node_modules/`,
  `tests/`, `e2e/`, config files, and the gitignored `dist/` build-output
  directory) drops the honest figure to **17.49% statements / 16.25%
  branches** — `content.js` reports flatly 0% across all four metrics.
  Weakest already-tracked files: `i18n.js` (15.78% stmts), `theme-manager.js`
  (29.16% stmts). Strongest: `lib/providers/**` (86-100% across all
  providers), `editor-adapters.js` (71.81%).
- `dist/` is correctly listed in `.gitignore` and not tracked by git — the
  build-output directory picked up by the honest coverage run above is only
  local cruft from a prior manual `scripts/publish.sh` run on this machine,
  not a repository problem, but it does need excluding from
  `collectCoverageFrom` explicitly.

## Non-Goals

Deliberately excluded as disproportionate for a vanilla, zero-build, small-
maintainer-count Chrome extension (the "C. Maximal" tier considered and
rejected during brainstorming):
- Mutation testing (Stryker or similar).
- Visual regression testing (Percy/Chromatic) — would also require paid
  tooling or self-hosted infrastructure disproportionate to project size.
- Automated semantic-release / conventional-commit enforcement — the
  existing manual version-bump release flow documented in `AGENTS.md`'s
  "Release Flow" section is left as-is.
- SBOM generation / license-compliance scanning.
- Mandatory N-reviewer branch protection rules — out of scope for this spec;
  if wanted, it's a GitHub repo-settings change, not a code change, and can
  be decided independently of this plan.
- Rewriting `content.js` in this pass. This spec only sets up the *coverage
  accounting* to see it honestly and starts the *ratchet* (see Architecture
  §2) — actually extracting testable logic out of it is the companion
  Design System spec's `clampToViewport()` work (already scoped there) plus
  future incremental extractions, not a bulk rewrite here.

## Architecture

### 1. Close the three verified lint/format gaps

- `package.json`'s `"lint"` script gains `--max-warnings 0`.
- Promote `no-unused-vars` and `eqeqeq` in `eslint.config.js` from `"warn"`
  to `"error"` (`no-var` can reasonably stay `"warn"` since it's a style
  preference already effectively enforced by Prettier's formatting choices
  and doesn't hide a correctness bug the way an unused variable or a `==`
  comparison can) — full list of severity changes is an implementation-plan
  decision, not fixed further here.
- Add `"format:check": "prettier --check ."` to `package.json` and include
  it in `npm run verify`, alongside a `"format"` script (`prettier --write
  .`) for local use.
- Add `npm run lint:webext` to `npm run verify` (or as a separate `verify`
  step in `ci.yml` — implementation-plan decision) so manifest/CSP
  validation runs on every push instead of only when remembered.

All of these land inside the existing `verify` job/script, so the already-
configured branch-protection required-check name (`verify`) keeps working
unchanged — no GitHub repo-settings change needed for this section.

### 2. Honest, floored (not aspirational) coverage

- `jest.config.js` gains an explicit `collectCoverageFrom` covering the
  whole repo minus `node_modules/`, `tests/`, `e2e/`, `dist/`, and top-level
  config files, so the reported number can never again silently exclude a
  file just because no test happens to import it.
- `coverageThreshold` is set **per path glob**, not as one global number,
  using Jest's built-in per-glob support:
  - `lib/providers/**`: a floor near its current ~90% (small buffer below
    today's actual number, e.g. 85%), since this directory is already
    well-tested and any regression here is cheap to catch.
  - A low global floor (near today's honest ~17%, e.g. 15%) that exists
    only to catch a *regression* (a large new untested file), not to imply
    17% is an acceptable target.
  - `content.js` is deliberately given **no per-file numeric threshold** —
    with an inline comment in `jest.config.js` stating why (it's covered by
    Playwright e2e today, not Jest units) rather than silently omitting it
    from `collectCoverageFrom`, so the 0% keeps showing up honestly in
    reports instead of being hidden.
- As pure-logic helpers get extracted out of `content.js` (starting with
  the Design System spec's `clampToViewport()`), each extracted file/
  function is added to `coverageThreshold` with its own floor — a realistic
  ratchet strategy for a large, DOM-heavy file rather than a big-bang
  rewrite or an unenforceable aspirational global target.

### 3. Architecture-boundary enforcement via ESLint (zero new dependencies)

Both rules below use `eslint.config.js`'s existing flat-config, file-glob-
scoped override mechanism (the same pattern already used for the `tests/**`
/`e2e/**` globals override) — no new ESLint plugin dependency is needed for
either.

- **Provider Pattern** (`AGENTS.md` Core Directive #4: "Never call `fetch()`
  against an AI API from UI code"): a `no-restricted-syntax` rule banning
  `fetch(` call expressions, scoped to every file *except*
  `lib/providers/**`. Any future code that tries to call an AI provider
  directly from `content.js`, `settings.js`, `sidepanel.js`, or
  `background/service-worker.js` fails lint immediately instead of relying
  on a reviewer noticing.
- **Storage Map contract**: rather than inventing a brand-new single
  wrapper module that would duplicate what already exists, this codifies
  the *actual* current ownership — `lib/theme-manager.js` already owns
  `omni_ai_theme`, `lib/history.js` already owns the history/usage-stats
  keys in `storage.local`. The real gap is the remaining Storage Map keys
  (`primaryLanguage`, `defaultLanguage`, every provider's `*ApiKey`,
  `apiModel`, `currentPreset`, `customGatewayBaseUrl`,
  `customGatewayModelName`, `customModelName`) which today are read/written
  directly wherever needed. A new `lib/storage.js` becomes the owner for
  *this remaining set* (typed getter/setter per key, matching the Storage
  Map table). A `no-restricted-properties`/`no-restricted-syntax` rule then
  bans direct `chrome.storage.sync.*`/`chrome.storage.local.*`/
  `chrome.storage.session.*` calls everywhere **except** the three
  designated owner files (`lib/theme-manager.js`, `lib/history.js`,
  `lib/storage.js`) — closing the actual gap without discarding two modules
  that already implement this pattern correctly.

### 4. An honest limitation: the `return true` convention isn't lint-automatable

`AGENTS.md`'s rule that every async `onMessage` case must `return true`
depends on control-flow analysis (does this specific `case` branch await
something before responding?) that a plain `no-restricted-syntax`/AST rule
cannot reliably express without a bespoke ESLint rule of real complexity —
judged not worth building for one call site pattern. Instead: the PR
template (§7) requires a passing unit test for any new/changed `onMessage`
case, and `tests/background/service-worker.test.js`'s existing pattern of
asserting each case's return value is the enforcement mechanism, not lint.
Stated here explicitly so this isn't silently assumed to be automated when
it isn't.

### 5. Pre-commit hook — fast local feedback, not a CI replacement

`husky` + `lint-staged` run ESLint and Prettier against staged files on
`git commit`, giving fast local feedback before a push. This is explicitly
a convenience layer: an agent working in a sandboxed environment may commit
without git hooks active (or may be instructed to skip them under specific
circumstances per the global git-safety rules), so **CI remains the actual,
non-bypassable gate** — the hook only exists to shorten the feedback loop
when it *is* active, never to replace what `ci.yml` enforces.

### 6. Dependency hygiene

- `.github/dependabot.yml` — weekly npm dependency-update PRs.
- `npm audit --audit-level=high` added as a blocking CI step (moderate/low
  advisories are reported but don't fail the build, to avoid gating on
  transitive-dependency noise that often can't be immediately fixed;
  high/critical block).

### 7. PR template + CODEOWNERS

- `.github/pull_request_template.md` mirrors `AGENTS.md`'s existing "Agent
  Checklist" section as literal Markdown checkboxes, so whichever agent
  opens the PR self-attests against the same list already required by this
  repo's own conventions, and a human reviewer (or a later agent session)
  can see at a glance what was and wasn't verified.
- `.github/CODEOWNERS` names the human maintainer as owner of the whole
  repo (or specific sensitive paths — `manifest.json`, `.github/workflows/
  release.yml`, `scripts/publish.sh` at minimum — implementation-plan
  decision) so that even in an agent-heavy contribution workflow, a human
  retains final approval authority over what actually merges and ships,
  consistent with this session's own risk-tiering practice (routine
  agent action vs. requires-human-confirmation).

## Error Handling

Not applicable in the traditional runtime sense — this spec changes build/
CI/lint tooling, not application behavior. The one behavioral change users
could notice: `npm audit --audit-level=high` failing CI on a genuinely new
high/critical advisory is a deliberate, desired failure (blocks a release
until addressed or explicitly accepted), not a bug to work around.

## i18n

Not applicable — no user-facing strings.

## Testing

This spec's own "testing" is largely about the tooling behaving as
designed:
- Confirm `npm run verify` still passes locally after every change in this
  spec is applied (it must, since the repo is lint/format-clean today per
  the Evidence section — nothing here should turn today's clean state red).
- Confirm the new per-glob `coverageThreshold` config actually fails CI when
  a probe commit intentionally drops a `lib/providers/*.js` file's coverage
  below its floor (verified once during plan implementation, then reverted
  — a real regression test for the regression-detection mechanism itself).
- Confirm the two new ESLint rules (`fetch()` outside `lib/providers/**`,
  direct `chrome.storage.*` outside the three owner files) each fail on a
  deliberately-introduced violation and pass on the current, clean
  codebase.

## Open Questions For The Implementation Plan

- Exact severity/scope decisions for individual ESLint rules beyond the
  three named in Architecture §1 (deferred to `writing-plans`, not a design
  decision).
- Whether `web-ext lint` becomes its own CI job or a step inside `verify` —
  a sequencing/CI-structure decision, not a design decision.
- CODEOWNERS path granularity (whole-repo owner vs. specific sensitive
  paths) — left for the plan to decide with the user directly, since it's
  closer to a policy choice than an architecture one.
