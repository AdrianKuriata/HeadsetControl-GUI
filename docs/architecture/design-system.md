# Design system — "Mono"

> **Status:** specified (PROJECT.md §2 + the approved mock). Implementation lands
> with issue #6 — reconcile this doc against the real code in that PR.

The visual authority is [`../maxwell-control-mono.html`](../maxwell-control-mono.html)
(single-file Vue 3 mock). Components are ported *from* the mock; this doc explains
the mechanics and rules — it never redefines values the mock already carries.

## Tokens

Defined as CSS variables in the mock's `:root` (the single source of design values):

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0a0a0a` | Background (near-black) |
| `--ink` | `#f5f5f3` | Primary text (off-white) |
| `--mid` | `#8a8a86` | Secondary text |
| `--low` | `#55554f` | Tertiary/disabled text |
| `--hair` | `#1f1f1d` | 1 px hairlines |
| `--hair-soft` | `#161614` | Softer hairlines |
| `--accent` | per platform | The **only** accent color (see below) |
| `--accent-dim` | per platform, 14% alpha | Accent washes (hover/active fills) |
| `--sans` | `'Inter Tight', system-ui` | UI typeface |
| `--mono` | `'IBM Plex Mono', monospace` | Micro-caps labels, values, tabular digits |

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
root element; CSS variables do the rest. **UI components never special-case
platforms** — they only consume `--accent`/`--accent-dim`. A profile without a
`variants` map, or an unmapped PID, gets the neutral fallback. (Mechanism: issue #15.)

Accent is used *sparingly*: active preset/option underline, slider handle on
hover/drag/focus, EQ edit points, LED dot, platform badge, dB value while dragging.
Everything else is monochrome.

## Controls language

- **Slider** (`HSlider`): 1 px line + dot handle. No tracks, no fills.
- **Options** (`HOptions`): plain text, active item underlined (accent).
- **Stepper** (`HStepper`): bare `−` / `+`.
- **Readout** (`HReadout`): mono font, tabular digits.

Features compose these H-components only — never raw `<input>`/`<button>`.
Missing a prop? Extend the H-component, don't bypass it.

## Equalizer visuals

Thin white curve on a hairline grid; subtle animated spectrum line behind it
(~13% white). Factory presets are read-only; custom presets have draggable points
showing the dB value while dragging (e.g. `+2.5 dB`, accent, mono font).
Live-audio spectrum (PipeWire + rustfft) is an M4+ upgrade (issue #28); until
then the mock's procedural animation is the fallback — as it also is for
`prefers-reduced-motion`, silence, or the setting being off.

## Accessibility

Full keyboard support, ARIA roles, `:focus-visible` ring in the accent color,
`prefers-reduced-motion` honored everywhere motion exists.

## Hard rules

- No gradients. No emoji in UI. No fonts beyond Inter Tight + IBM Plex Mono.
- Desktop-only: min width 900 px, no mobile breakpoints.
- One accent at a time; monochrome otherwise.
- The mock decides visual disputes; deviations require the owner's sign-off
  (product decision → PROJECT.md §10).

## Related, designed elsewhere

The tray battery icon (monochrome, Rust-rendered, M3 — issues #19/#20) follows the
same Mono language; its spec lives in PROJECT.md §2.1 until implementation.
