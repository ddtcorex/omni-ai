# Design: Omni AI Vanilla Design System (tokens, shared components, interaction fixes)

**Status:** Approved by user, pending spec file review
**Author:** Claude (brainstorming session with ddtcorex)
**Date:** 2026-09-02

## Goal

Unify styling and interaction behavior across Omni AI's three UI surfaces — the
content-script overlay (Shadow DOM), the side panel (`sidepanel/`), and the
settings page (`settings.html`) — into a single, versionable design system,
and fix three concrete positioning/interaction bugs discovered while auditing
those surfaces. The result should make the extension feel like one coherent
product instead of three independently-styled screens, and reduce redundant
or error-prone user actions (icon appearing off-screen, no way back to the
action menu after a keyboard-shortcut result).

## Why

A design-token and pain-point audit (see "Evidence" below) found the three
surfaces have drifted: the same visual concept (accent color, "medium"
border-radius, spacing unit) has 2-3 different names and, in one case
(border-radius), 3 different pixel values. Theme handling is duplicated
4 separate times in `content.js` with a default that disagrees with the
canonical `theme-manager.js`. Common UI patterns (icon button, primary
button, spinner, info card) are reimplemented independently per surface with
diverging visual language, including a literal class-name collision
(`.icon-btn` defined differently in `settings.css` and `sidepanel.css`).

Separately, the user reported three concrete interaction pain points, traced
to two root causes:
- No viewport-edge clamping exists anywhere in the positioning code
  (`content.js:751-771`, `.omni-ai-quick-btn { position: absolute }` with no
  bound on `window.innerWidth/innerHeight`), so the floating button or result
  card can render partly or fully off-screen near page edges, and the empty-
  input case always anchors to the input's bottom-right corner regardless of
  where the user is actually focused inside a large field.
- Two structurally different, disconnected code paths position and track
  context for the *same* result-card UI: the click-triggered path (via the
  floating button) stores `lastMenuContext` and offers a working "Back to
  menu" button; the keyboard-shortcut path (Alt+R/T/F/A, routed straight from
  `background/service-worker.js`'s `chrome.commands.onCommand` to
  `SHOW_RESULT`) never populates that context, so its "Back" button just
  closes the overlay entirely — there is no way to try a different action on
  the same selection without restarting the whole selection-and-trigger
  flow.

## Evidence

(From two Explore-agent audits performed during brainstorming — see this
session's transcript for full detail. Summarized findings retained here so
future readers don't have to re-derive them.)

**Token drift** (file:line as of 2026-09-02):
- `overlay.css:51` `--ai-accent: #8b5cf6` vs `settings.css:17`/`sidepanel.css:14`
  `--accent-purple: #8b5cf6` — same color, different names, inconsistent prefix.
- `overlay.css:62` `--ai-radius-md: 8px` vs `settings.css:38` `--radius-md: 10px`
  vs `sidepanel.css:25` `--radius-md: 8px` — three values for "medium radius."
- `overlay.css` has no spacing-scale tokens at all (every padding/gap/margin
  is a hardcoded px literal); `settings.css`/`sidepanel.css` tokenize spacing
  via `--spacing-xs..2xl`.
- `sidepanel.css:16` defines only `--error`, omitting `--success`/`--warning`
  that both other files define.
- Three independent icon-button implementations at three different sizes
  (`overlay.css:173-216` 24px, `settings.css:683-706` 32px, `sidepanel.css:
  106-123` 32px) and three independent spinner implementations with
  different keyframe names (`omniAiSpin` 0.7s vs generic `spin` 1s; side
  panel has no spinner at all).

**Theme handling:** `content.js` re-implements `theme-manager.js`'s
system-preference check independently at lines 474-484, 737-748, 836-845,
1684-1688, each with its own local default of `"system"` — while
`theme-manager.js:22`'s own `getThemePreference()` defaults to
`THEMES.LIGHT`. `settings.js` and `sidepanel.js` both import and use
`theme-manager.js` directly and are consistent with each other;
`content.js` is the outlier, because `applyTheme()` (`theme-manager.js:38`)
hardcodes `document.documentElement` as its target, which is wrong for a
Shadow-DOM overlay mounted on an arbitrary third-party page.

**Positioning:** `createQuickBtn()` (`content.js:751-771`) has three branches
(mouse position / input rect / selection rect) with no viewport clamping.
Click-triggered menus anchor on the floating button's own rect
(`content.js:798-800`); keyboard-shortcut results anchor on
`getSelectionRect() || currentAnchorRect` (`content.js:1496,1543-1544`) — a
genuinely different code path. `lastMenuContext` is set only inside
`showQuickActionMenu()` (`content.js:828-833`), which the shortcut flow never
calls.

## Non-Goals

- **Not** adopting Tailwind, shadcn/ui, Radix, React, or any build step.
  Omni AI's Core Directive #1 (`AGENTS.md`) is zero-framework, zero-build —
  this design system ships as plain CSS custom properties and vanilla JS,
  loaded via `<link>` (settings/side panel) or the existing fetch-into-
  shadow-root mechanism (content script overlay). We adopt only the
  *methodology* of the `maestro-design` skill (a design-token catalog, an
  approval-gated "system" step, a persisted source-of-truth doc, an a11y/
  motion checklist) — never its Tailwind/shadcn output format.
- **Not** implementing the "Compose from prompt" or "length-change insight"
  features brainstormed earlier in this session. Those are a separate,
  later sub-project that will consume the tokens/components this spec
  produces, so they're built once against the final shared components
  instead of twice.
- **Not** a full flow/IA redesign of the extension. Scope is: shared tokens,
  shared component classes for patterns that already exist independently in
  all three surfaces, theme-handling unification, and the three positioning/
  action-switching bugs above. No new screens, no new navigation model.
- **Not** changing what any action *does* — only how results are positioned,
  how the user gets back to try another action, and how everything is
  visually styled.

## Architecture

### 1. Token source of truth — `lib/design-tokens.css`

A single new file defines every CSS custom property (color, spacing scale,
radius scale, typography, transition, shadow) once, under a **unified
`--omni-*` prefix** used by all three surfaces (replacing `overlay.css`'s
`--ai-*` prefix and `settings.css`/`sidepanel.css`'s unprefixed names).

The prefix is kept — not dropped — specifically because the overlay renders
inside a Shadow DOM on arbitrary third-party pages, and CSS custom
properties inherit through shadow boundaries; a host page that happens to
define its own `--radius-md` or `--accent` could otherwise leak into Omni
AI's UI. A single unambiguous prefix protects all three surfaces uniformly,
not just the overlay.

Loading, with no build step:
- `settings.html` / `sidepanel/sidepanel.html`: add
  `<link rel="stylesheet" href="../lib/design-tokens.css">` before the
  page's own stylesheet.
- Content-script overlay: `content.js` already `fetch()`s `overlay.css` and
  injects it as a `<style>` into the shadow root (`ensureUiRoot()`). Extend
  this to also fetch `lib/design-tokens.css` and inject it (order: tokens
  first, then component/overlay-specific rules). `lib/design-tokens.css`
  must be added to `web_accessible_resources` in `manifest.json`.

Two alternative approaches were considered and rejected:
- Keeping three separate files with a "convention" of matching values by
  hand — this is the status quo, and is exactly what produced the
  three-different-radius-values drift documented above.
- Generating merged CSS at build time (e.g. via PostCSS) — rejected outright
  as a Core Directive #1 violation (zero build step).

### 2. Theme handling unification — `lib/theme-manager.js` + `content.js`

`applyTheme()` gains an optional second parameter:
`applyTheme(themePreference, root = document.documentElement)`. Callers in
`settings.js`/`sidepanel.js` are unaffected (they rely on the default).
`content.js` stops re-implementing the system-preference check in four
places; instead it loads the module via dynamic import —
`await import(chrome.runtime.getURL("lib/theme-manager.js"))` — the standard
pattern for a classic-script content script to consume an ES module, and
calls `applyTheme(pref, shadowHostElement)` so the light/dark class lands on
the Shadow DOM host instead of the third-party page's `<html>`. This also
resolves the default-value disagreement (`"system"` vs `THEMES.LIGHT`) as a
side effect of deleting the duplicated logic.

### 3. Shared component layer — `lib/design-system.css`

A second new file, loaded via the same two mechanisms as
`design-tokens.css`, defines reusable classes for patterns that currently
exist independently, once each, per surface:
- `.ds-icon-btn` — replaces `.omni-ai-icon-btn`, `.icon-btn` (settings),
  `.icon-btn` (side panel — same class name as settings today, but
  different rules; a real collision risk if the two were ever loaded in the
  same document).
- `.ds-btn-primary` — replaces `.omni-ai-btn-primary`, `.save-btn`,
  `.action-btn`, unifying the gradient-vs-flat visual disagreement between
  overlay/settings and the side panel.
- `.ds-spinner` — replaces `.omni-ai-spinner` and `.validate-spinner`
  (currently two different keyframe names for the same concept); the side
  panel currently has no loading spinner at all and gains one.
- `.ds-card` — replaces `.omni-ai-context-preview`, `.result-area`,
  `.validation-message`, giving result/info/status cards one consistent
  base (border, background, radius, spacing) with room for existing
  status-color variants (success/error/processing) as modifier classes.

Retrofitting each surface's markup/CSS to use these classes happens per
surface as separate implementation-plan tasks (three surfaces × swap classes
+ delete the old surface-local rules), not as one giant change.

### 4. Accessibility & motion baseline

Applied as part of writing `design-system.css` and retrofitting each
surface (adapted from `maestro-design`'s Pre-delivery Checklist, hand-
verified rather than tool-verified since no a11y-testing library is being
added):
- Minimum 4.5:1 text contrast for all token color pairs.
- `focus-visible` ring (2px) on every clickable/focusable element defined by
  the shared component classes.
- `prefers-reduced-motion: reduce` respected by any transition/animation
  defined in `design-tokens.css`/`design-system.css` (including the new
  unified spinner).
- Touch targets ≥24px with ≥8px gap (WCAG's web minimum — the extension is
  desktop-only, so the 44/48pt mobile figures from the checklist don't
  apply).

### 5. Interaction & positioning fixes (content.js)

These live in `content.js` (behavior, not tokens) but are grouped into this
spec because they touch the exact same result-card/menu component being
unified in section 3, and fixing them once now avoids a second pass over
that component immediately after this one lands.

- **`clampToViewport(top, left, width, height)`** — a new shared helper used
  by both the floating-button positioning code (`createQuickBtn()`,
  `content.js:751-771`) and the result-card/menu positioning code
  (`showResultOverlay()`, `showQuickActionMenu()`), flipping to the opposite
  side of the anchor point when the default position would overflow
  `window.innerWidth`/`innerHeight` (or the current scroll position),
  the same general approach standard tooltip-positioning libraries use.
- **Anchor by selection end-point, not full bounding box** — for a
  multi-line selection, anchor the button/card near the last client rect
  from `Range.getClientRects()` (the end of the highlighted text, closest
  to where the user's eyes/cursor naturally are) rather than
  `getBoundingClientRect()`'s bounding box of the whole selection.
- **Stop trusting stale mouse coordinates for non-mouse selections** — only
  use the last-known mouse position when the selection was actually made by
  a mouse action (the existing `mouseup` path); selections extended via
  `keyup` (Shift+Arrow, Ctrl+A) or made programmatically always anchor off
  the live selection rect instead, since a remembered mouse position from
  unrelated prior activity is not a meaningful anchor point.
- **Unify result-card context across trigger paths** — whatever code path
  shows a result card (click-triggered menu action, or a keyboard shortcut
  routed from `background/service-worker.js`'s `chrome.commands.onCommand`)
  populates the same context object `lastMenuContext` currently only set
  inside `showQuickActionMenu()` (`content.js:828-833`). The existing
  "Back" button (`content.js:1521,1556-1566`) then always has a menu to
  return to, regardless of whether the result was reached by click or by
  shortcut — closing the gap where a shortcut-triggered result is currently
  a dead end requiring the user to redo the entire select-and-trigger flow
  to try a different action.

### 6. Persisted source of truth

`docs/design-system/MASTER.md` — committed to the repo (not gitignored,
following `maestro-design`'s persist pattern but adapted: this is a small
team, and the doc should be readable by every contributor, not just design
tooling). Documents every token name/value/purpose, every shared component
class and its variants, the theme-handling contract, and the a11y/motion
baseline, so future work (including the later Compose/Insight sub-project)
has one place to check before inventing a new token or class.

## Error Handling

No new failure modes are introduced by tokens/CSS. For the dynamic
`import()` of `theme-manager.js` inside `content.js`: if it rejects (e.g.
the extension context was invalidated mid-navigation, a known Chrome
extension edge case), theme application is skipped for that page load
rather than throwing — the overlay still functions with whatever
light/dark state its CSS defaults to, matching the existing fail-soft
posture the rest of `content.js` uses for messaging failures.

## i18n

No new user-facing strings are introduced by this spec — it is a styling
and positioning-logic change. If the implementation plan surfaces a need for
new copy (unlikely), it follows the existing mandatory i18n rule from
`AGENTS.md`.

## Testing

- **Jest**: a token-consistency test that parses `lib/design-tokens.css` and
  asserts no `--ai-*`/unprefixed legacy names remain in `overlay.css`,
  `settings.css`, `sidepanel.css`'s own `:root` blocks (i.e. they now only
  reference `var(--omni-*)`, not redefine their own copies). Unit tests for
  `clampToViewport()` (pure function, easy to test with fixed viewport
  dimensions and anchor coordinates) and for `applyTheme(pref, root)`'s new
  parameter (asserts the class lands on the passed-in root, not
  `document.documentElement`, when one is supplied).
- **Playwright e2e**: extend existing selection/overlay specs to assert the
  floating button and result card never render with a negative
  `left`/`top` or a right/bottom edge beyond `window.innerWidth`/
  `innerHeight` when the selection is near a page edge (this is the
  concrete regression test for the viewport-clamping fix). A new spec
  exercises a keyboard-shortcut-triggered result card's "Back" button and
  asserts it returns to the action menu (regression test for the unified
  `lastMenuContext`).
- **Manual smoke** (added to `AGENTS.md`'s manual checklist): floating
  button and result card stay fully on-screen when triggered near each of
  the four viewport edges; Back button works after both a click-triggered
  and a shortcut-triggered result.

## Open Questions For The Implementation Plan

(Deliberately left for `writing-plans`, not resolved here, since they're
sequencing/task-breakdown decisions rather than design decisions:)
- Whether the three surfaces' retrofit (swapping to `.ds-*` classes) should
  be three parallel subagent-driven-development tasks or sequential, given
  they touch independent files with no shared ownership conflicts.
- Exact `docs/design-system/MASTER.md` template structure — the spec above
  fixes its *content*, not its Markdown layout.
