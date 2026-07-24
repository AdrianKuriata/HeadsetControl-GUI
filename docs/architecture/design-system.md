# Design system — "Mono"

The visual authority is [`../maxwell-control-mono.html`](../maxwell-control-mono.html)
(single-file Vue 3 mock). Components are ported *from* the mock; this doc explains
the mechanics and rules — it never redefines values the mock already carries.

## How it is built

Styling is **Tailwind v4**, configured entirely in CSS
([ADR 0008](../decisions/0008-tailwind-v4-mono-design-system.md)) — there is no
`tailwind.config.js`, and components carry **no `<style>` blocks**.

| Path | Holds |
|---|---|
| `src/styles/index.css` | the only stylesheet `main.ts` imports: `@fontsource` imports, `@import "tailwindcss"`, the `@theme` tokens, and the two global base rules |
| `src/controls/` | the H-components (`HSlider`, `HOptions`, `HStepper`, `HReadout`) |
| `index.html` | document-level utilities (`bg-bg`, `font-sans`, the 900 px floor) |

Fonts are **bundled**, never fetched: `@fontsource/inter-tight` and
`@fontsource/ibm-plex-mono`, `latin` + `latin-ext` (Polish diacritics) subsets,
only the weights the mock uses. The Tauri ACL allows no network, so a CDN font
link would simply not load.

## Tokens

Declared in the `@theme` block of `src/styles/index.css`, copied verbatim from
the mock's `:root`. Naming them in Tailwind's namespaces is what turns each one
into a utility, so the design values stay single-sourced:

| Token | Value | Utilities | Role |
|---|---|---|---|
| `--color-bg` | `#0a0a0a` | `bg-bg` | Background (near-black) |
| `--color-ink` | `#f5f5f3` | `text-ink`, `bg-ink` | Primary text (off-white) |
| `--color-mid` | `#8a8a86` | `text-mid` | Secondary text |
| `--color-low` | `#55554f` | `text-low`, `bg-low` | Tertiary/disabled text |
| `--color-hair` | `#1f1f1d` | `border-hair` | 1 px hairlines |
| `--color-hair-soft` | `#161614` | `border-hair-soft` | Softer hairlines |
| `--color-accent` | per platform | `text-accent`, `border-b-accent` | The **only** accent color (see below) |
| `--color-accent-dim` | per platform, 14% alpha | `bg-accent-dim` | Accent washes (hover/active fills) |
| `--font-sans` | `'Inter Tight', system-ui` | `font-sans` | UI typeface |
| `--font-mono` | `'IBM Plex Mono', monospace` | `font-mono` | Micro-caps labels, values, tabular digits |

Two rules are hand-written in `@layer base` rather than expressed as utilities —
the `:focus-visible` accent ring and the `prefers-reduced-motion` kill switch.
Both are accessibility guarantees that have to hold even where someone forgets a
variant.

## Platform accent — a core mechanism, not a skin

One accent color, driven by the connected device's platform variant:

| `[data-platform]` | Accent | |
|---|---|---|
| `xbox` | `#43b34a` | mock's `:root` default |
| `ps` | `#3a86d4` | |
| `nintendo` | `#e4404b` | |
| *(none / unknown)* | white | neutral fallback — **spec only, not yet in the mock**; add with issue #15 |

Mechanics: `DeviceProfile` may carry `variants: { [pid]: 'xbox' | 'ps' | 'nintendo' | 'pc' }`.
The core resolves the connected PID against that map and sets `data-platform` on the
root element; the CSS variable does the rest. Tailwind compiles every `*-accent`
utility to `var(--color-accent)`, so re-pointing that one variable under a
`[data-platform]` scope re-themes the whole UI at once. **UI components never
special-case platforms** — they only use `*-accent` utilities. A profile without a
`variants` map, or an unmapped PID, gets the neutral fallback. (Mechanism: issue #15.)

Accent is used *sparingly*: active preset/option underline, slider handle on
hover/drag/focus, EQ edit points, LED dot, platform badge, dB value while dragging.
Everything else is monochrome.

## Controls language

- **`HSlider`** — 1 px hairline + dot handle; no track, no chunky fill. Wraps a
  native `<input type="range">`. `variant="fill"` draws the line up to the handle
  (a magnitude: sidetone), `variant="center"` marks the middle instead (a
  balance: chatmix). Props: `modelValue`, `min`, `max`, `step`, `label`, `variant`.
- **`HOptions`** — plain text options, the active one underlined in the accent.
  A radiogroup with roving tabindex (see Accessibility). Props: `modelValue`,
  `options: { value, label }[]`, `label`.
- **`HStepper`** — bare `−` / `+` around a slot-rendered value. Emits a
  *direction* (`step: -1 | 1`); the feature owns the scale and the bounds
  (`atMin`/`atMax`). Props: `decrementLabel`, `incrementLabel`, `atMin`, `atMax`.
- **`HReadout`** — the value column: mono font, tabular digits, optional dimmed
  `#suffix` slot (`12` + ` / 31`).

Three rules make these reusable:

1. Features compose H-components only — never raw `<input>`/`<button>`. Missing a
   prop? Extend the H-component, don't bypass it.
2. **Controls hold no strings and no domain knowledge.** Labels, formatted
   values and accessible names arrive as props/slots, already translated by the
   feature. That is why `"off"`, `"30 min"` and `"−10 dB"` live in feature rows,
   not here.
3. **Tests select on `data-part`, never on a class.** Utility classes are
   styling, not a contract: `[data-part="fill"]` survives a restyle,
   `.h-slider__fill` would not.

## Equalizer visuals

Thin white curve on a hairline grid; subtle animated spectrum line behind it
(~13% white). Factory presets are read-only; custom presets have draggable points
showing the dB value while dragging (e.g. `+2.5 dB`, accent, mono font).
Live-audio spectrum (PipeWire + rustfft) is an M4+ upgrade (issue #28); until
then the mock's procedural animation is the fallback — as it also is for
`prefers-reduced-motion`, silence, or the setting being off.

## Accessibility

Full keyboard support, ARIA roles, a `:focus-visible` ring in the accent color,
`prefers-reduced-motion` honored everywhere motion exists. Those last two are the
two hand-written global rules in `src/styles/index.css`.

Two patterns are load-bearing and are covered by tests:

- **`HSlider` inherits the platform's keyboard behaviour** — arrows, Home/End,
  PageUp/PageDown — because it wraps a real `<input type="range">` instead of
  re-implementing one.
- **`HOptions` is a radiogroup with roving tabindex**: the *group* is a single
  tab stop (the checked option has `tabindex="0"`, the rest `-1`), and
  Arrow/Home/End move both the selection and the focus, wrapping at the ends.
  Tabbing through every option would be the wrong contract for `role="radio"`.

## Hard rules

- Styling is Tailwind utilities. No `<style>` blocks in components; the only
  hand-written CSS is the `@theme` tokens and the two base rules above.
- No gradients. No emoji in UI. No fonts beyond Inter Tight + IBM Plex Mono.
- Desktop-only: min width 900 px, no mobile breakpoints.
- One accent at a time; monochrome otherwise.
- The mock decides visual disputes; deviations require the owner's sign-off
  (product decision → PROJECT.md §10).

## Related, designed elsewhere

The tray battery icon (monochrome, Rust-rendered, M3 — issues #19/#20) follows the
same Mono language; its spec lives in PROJECT.md §2.1 until implementation.
