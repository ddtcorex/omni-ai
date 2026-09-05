## Summary

<!-- What does this PR do, and why? -->

## Agent Checklist

- [ ] No framework imports, no bundler assumptions — files still load raw in the browser
- [ ] New UI renders inside the Shadow DOM root using tokens (`--omni-accent`, `--omni-glass-bg`, …) from `lib/design-tokens.css` / components from `lib/design-system.css` — never hardcode colors
- [ ] Every new `onMessage` case that replies asynchronously returns `true`
- [ ] Text replacement verified for `input` + `textarea` + `contenteditable`
- [ ] Every user-facing string goes through i18n (`_locales/en/messages.json`) — zero hardcoded visible text
- [ ] `npm test` green; no leftover `console.log`s (warnings/errors OK)

## Test Plan

<!-- How was this verified? Commands run, manual smoke steps, screenshots if UI changed. -->
