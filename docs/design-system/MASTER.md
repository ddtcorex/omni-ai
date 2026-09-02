# MASTER — Omni AI Design System

Single source of truth for the tokens and shared component classes used
across all three UI surfaces: the content-script overlay (Shadow DOM), the
side panel (`sidepanel/`), and the settings page. Adapted from the
`maestro-design` skill's persist pattern, but plain CSS custom
properties/classes — no Tailwind, no build step (see `AGENTS.md` Core
Directive #1).

## Files

- `lib/design-tokens.css` — every `--omni-*` custom property.
- `lib/design-system.css` — shared component classes (`.ds-*`).

Both are loaded via `<link>` in `settings.html`/`sidepanel/sidepanel.html`,
and fetched-and-injected into the content-script Shadow DOM by
`content.js`'s `ensureUiStyles()`.

## Adding a new token

1. Check this doc and `lib/design-tokens.css` first — a close-enough token
   probably already exists (e.g. don't add `--omni-spacing-13px`; use the
   existing scale).
2. If genuinely new, add it to `lib/design-tokens.css`'s `:root, :host`
   block, and to both light-mode override blocks
   (`:root.omni-ai-light-mode`, `:host-context(.omni-ai-light-mode)`) if it
   has a different light-mode value.
3. Add it to the `CRITICAL_TOKENS` list in `tests/design-tokens.test.js` if
   it's load-bearing enough that its accidental deletion should fail CI.

## Adding a new shared component class

1. Check `lib/design-system.css` and the table below first.
2. Prefix new classes `.ds-*` to keep them visually distinct from
   surface-local classes (`.omni-ai-*` for the overlay, plain names for
   settings/side panel markup that's genuinely surface-specific).
3. Add it to `tests/design-system.test.js`.

## Token reference

| Token | Purpose |
| --- | --- |
| `--omni-bg-primary` / `--omni-bg-secondary` / `--omni-bg-tertiary` | Surface background layers, darkest to lightest (dark mode) / lightest to darkest (light mode). |
| `--omni-bg-hover` / `--omni-bg-active` | Interactive-state backgrounds. |
| `--omni-glass-bg` / `--omni-glass-heavy` | Translucent backdrop-filter backgrounds (overlay-heavy usage; settings/side panel use these sparingly). |
| `--omni-border` / `--omni-border-hover` | Default and hover border colors. |
| `--omni-text-primary` / `--omni-text-secondary` / `--omni-text-tertiary` / `--omni-text-muted` | Text hierarchy. `-tertiary` and `-muted` are intentionally distinct (tertiary skews slightly lighter in dark mode) — don't collapse them without checking both surfaces' current usage. |
| `--omni-accent` / `--omni-accent-cyan` / `--omni-accent-gradient` | Brand purple, secondary cyan, and the two-color gradient used on primary actions. |
| `--omni-success` / `--omni-warning` / `--omni-error` | Status colors. |
| `--omni-shadow-sm` / `--omni-shadow-lg` | Elevation. |
| `--omni-radius-sm` / `-md` / `-lg` / `-full` | Corner radius scale — `-md` is 8px (not settings.css's old 10px; the overlay's 8px value won during unification since it was more common across surfaces). |
| `--omni-spacing-xs` through `-2xl` | 4/8/12/16/24/32px scale. |
| `--omni-font-xs` / `-sm` / `-md` | Overlay's compact font sizes; settings/side panel mostly set their own larger body text directly rather than from this scale — this scale exists primarily for the overlay's dense UI. |
| `--omni-transition-fast` / `-normal` | 150ms / 250ms eased transitions. |

## Component reference

| Class | Purpose | Notes |
| --- | --- | --- |
| `.ds-icon-btn` | Small (24x24) icon-only button — back/close/settings-gear affordances. | Replaces the three previously-independent `.omni-ai-icon-btn` / `.icon-btn` (settings) / `.icon-btn` (side panel) implementations. |
| `.ds-btn-primary` | Primary/gradient action button. | Replaces `.omni-ai-btn-primary`, `.save-btn`, `.action-btn`. |
| `.ds-btn-secondary` | Secondary/flat action button. | Replaces `.omni-ai-btn-secondary`. |
| `.ds-spinner` | Loading spinner. | Replaces `.omni-ai-spinner`, `.validate-spinner`; also now used by the side panel, which previously had no spinner at all. |
| `.ds-card` | Base info/result/status card. | Replaces `.omni-ai-context-preview`, `.result-area`, `.validation-message`. |
| `.ds-card--accent` | Left-accent-border modifier. | Used where a card needs a colored left border (e.g. the Quick Ask context preview). |
| `.ds-card--success` / `--error` / `--processing` | Status-color modifiers. | Used by the settings page's validation message. |

## Accessibility & motion baseline

- Minimum 4.5:1 text contrast for every token color pair used for text on a
  background token.
- Every focusable element defined by a `.ds-*` class shows a visible
  `focus-visible` outline (browser default is acceptable; do not remove it
  with `outline: none` without providing an equivalent replacement).
- `.ds-spinner`'s animation respects `prefers-reduced-motion: reduce`
  (slows rather than removes, so loading state is still perceivable).
- Touch targets: `.ds-icon-btn` is 24x24px, meeting the WCAG web minimum;
  keep at least 8px gap between adjacent icon buttons in any new layout.

## Theme handling

`lib/theme-manager.js`'s `applyTheme(themePreference, root)` /
`initTheme(root)` accept an optional root element (default
`document.documentElement`, used as-is by `settings.js`/`sidepanel.js`).
`content.js` calls `initTheme(omniUiHost)` once per page load, targeting the
Shadow DOM host element (not the arbitrary host page's own `<html>`). The
overlay's light-mode token overrides are defined with
`:host-context(.omni-ai-light-mode)` in `lib/design-tokens.css`, which
matches when the shadow host carries that class and cascades the overrides
to every element inside the shadow tree — no per-element class toggling is
needed or should be reintroduced.
