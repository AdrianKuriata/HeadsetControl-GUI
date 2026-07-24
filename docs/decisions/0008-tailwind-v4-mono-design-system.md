# 0008. Tailwind v4 as the styling engine, with the Mono tokens as its theme

## Status
Accepted (2026-07-24)

## Context

Issue #6 ports the approved mock (`docs/maxwell-control-mono.html`) into a real
design system. The mock is plain CSS, and the issue's wording ("design tokens as
CSS variables") describes that. The first implementation followed it literally:
`tokens.css` + `base.css` + a `<style scoped>` block per control.

The owner then decided the project uses **Tailwind** — a direction not previously
recorded anywhere (not in PROJECT.md, this ADR series, any issue, or
`package.json`). Full adoption was chosen over a hybrid, so this ADR records the
technical shape of that decision and supersedes the plain-CSS approach before it
ever shipped.

Two properties of the design system had to survive the switch, because the rest
of the app depends on them:

- **The platform accent is a core mechanism, not a skin** (PROJECT.md §2): one
  variable re-points and the whole UI re-themes, with no component naming a
  platform.
- **The mock's slider is a native `<input type="range">`** whose look comes
  entirely from vendor pseudo-elements — historically the thing utility CSS
  cannot express.

## Decision

- **Tailwind v4 via `@tailwindcss/vite`**, entry point `src/styles/index.css`.
  No `tailwind.config.js` — v4 is configured in CSS.
- **The Mono tokens are the Tailwind theme.** `@theme` declares them in
  Tailwind's own namespaces (`--color-ink`, `--color-hair`, `--color-accent`,
  `--font-mono`, …), so the design values become utilities (`text-ink`,
  `border-hair`, `font-mono`) and stay single-sourced from the mock's `:root`.
- **The platform accent keeps working, unchanged in spirit.** Tailwind v4
  compiles `*-accent` utilities to `var(--color-accent)`, so re-pointing that
  variable under `[data-platform="ps" | "nintendo"]` re-themes every accent
  utility at once. Verified in a browser: the accent follows the attribute and
  falls back to the mock's Xbox green. (Setting the attribute from the connected
  PID is still issue #15.)
- **No `<style>` blocks in components.** Vendor pseudo-elements are handled with
  arbitrary variants — `[&::-webkit-slider-thumb]:size-[11px]`,
  `hover:[&::-moz-range-thumb]:bg-[var(--color-accent)]` — which removes the last
  reason to keep scoped CSS. The class list on `HSlider`'s input is long; that is
  the accepted cost of the "Tailwind everywhere" call.
- **Exactly two global rules stay hand-written**, in `@layer base`: the
  `:focus-visible` accent ring and the `prefers-reduced-motion` kill switch.
  Both are accessibility guarantees that must hold even where someone forgets a
  variant — which is precisely what a per-element utility cannot promise.
- **Tests select on `data-part`, never on classes.** Utility classes are styling,
  not a contract; `[data-part="fill"]` survives a restyle, `.h-slider__fill`
  would not.
- **`prettier-plugin-tailwindcss`** sorts class lists, so ordering never shows up
  in a diff or a review comment. It resolves the theme through
  `tailwindStylesheet`, which also makes a typo'd custom token visible.

Two decisions the mock does not answer are settled here as well:

- **Self-hosted fonts.** `@fontsource/inter-tight` and `@fontsource/ibm-plex-mono`,
  only the weights the mock uses, `latin` + `latin-ext` subsets (`latin-ext`
  carries the Polish diacritics). The mock's Google Fonts link cannot survive:
  the Tauri ACL allows no network beyond the updater and the app must work
  offline.
- **Wrap native form controls rather than re-implement them.** `HSlider` wraps
  `<input type="range">`, so arrows/Home/End/PageUp/PageDown come from the
  platform and assistive technology sees a real slider. Where no native element
  fits, implement the full ARIA pattern: `HOptions` is a radiogroup with roving
  tabindex — one tab stop for the group, arrows moving selection *and* focus.
  Verified in a browser: the four controls expose five tab stops, not seven.

## Consequences

- One styling mechanism across the app; screens from #5/#7 were converted in the
  same PR, so no file is left on the old approach.
- Utility class lists are long on the slider and repeated across screen shells.
  When a shell repeats a fourth time, extract a component — not `@apply`.
- The build stays offline-only: ~24 bundled font files, no CDN reference in the
  emitted CSS.
- `HOptions` cannot be swapped for a plain list of buttons later without breaking
  the keyboard contract its tests pin down. That is intentional.
- Issue #6's wording ("design tokens as CSS variables") is satisfied in substance
  — they *are* CSS variables — but via `@theme` rather than a hand-written
  `:root`. The issue text was updated to match.
