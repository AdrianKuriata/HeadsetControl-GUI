# 0014. Feature rows: one capability, one component, one shared prop contract

## Status
Accepted (2026-07-24)

## Context

The UI is rendered from what the device reports, not from a device model
(PROJECT.md §3.1). Issue #12 turns that into components: `features/registry.ts`
maps a `CAP_*` identifier to the component that renders it, and adding a
`headsetcontrol` feature must be a new file plus one registry line, with **no
edit to existing files** (OCP, PROJECT.md §3.4).

That only holds if whatever renders the rows can hand any row what it needs
without knowing which capability it is. Three further facts shaped the contract:

- **Most capabilities cannot be read back.** The CLI reports battery and chatmix
  and nothing else (ADR 0009), so a row usually has no device value at all —
  only what this app last wrote (ADR 0012).
- **Chatmix is reported but not writable.** There is no flag to set it; the dial
  is on the headset.
- **Preset names and band frequencies are model knowledge**, which belongs in
  `src/profiles/` (#17) and does not exist yet.

## Decision

- **Every row takes the same props and emits one event** (`features/contract.ts`):
  `value?: ParamValue` (the last value written, `undefined` when none) and
  `readings?: DeviceState | null` (what the device reports), and it emits
  `change(value: ParamValue)`. `ReadyScreen` renders
  `<component :is="row.component" :value="params[capability]" :readings @change>`
  in one loop, so it names no capability; `App.vue` turns the event into
  `device.write(backend, capability, value)`, so it names none either.
- **A row with no value shows "unknown", never "off".** The app has not read the
  device — claiming a setting is off would be a lie about hardware. Sliders sit
  at their minimum with a `—` readout; option groups mark nothing as chosen
  (`HOptions` accepts `null` for exactly this).
- **A capability with no component is logged once and skipped**, and capabilities
  rendered elsewhere (the battery, in the device header) are listed so they are
  not mistaken for unknown ones. A newer binary reporting something this build
  cannot draw is never an error.
- **Ranges come from the CLI, not from the UI's imagination**: sidetone `0-128`,
  noise filter `0|1|2`, inactive time `0-90` minutes, equalizer presets `0-9` —
  each named as a constant in the component that uses it, with the CLI flag in a
  comment. Auto power-off steps a ladder of the values a person picks
  (0/5/10/15/30/45/60/90) rather than one minute at a time.
- **The equalizer section is presets only**, numbered `Preset 1…10`. Names are
  model knowledge (#17) and the draggable curve is the M2 equalizer (#16).
- **The row layout is a control**, `HRow` — name, control, value in the mock's
  three columns — so the rows stay free of layout and the layout free of copy.

## Consequences

- A new `headsetcontrol` feature is genuinely one file plus one line; the
  registry test asserts it by registering a component nothing else knows about.
- Rows are pure: no store, no backend, no device. They are mounted with props
  and assert on emitted events, which is why the layer tests are trivial.
- The same contract carries the M2 work: the full equalizer (#16) replaces one
  component, and platform variants (#15) reach rows through tokens rather than
  props.
- Two costs are accepted. A row cannot show what the headset actually holds
  until the user changes it — inherent in the CLI, not fixable here. And a
  capability the device reports but this build cannot render is invisible in the
  UI (it is in the log), which is the forward-compatibility trade PROJECT.md
  §3.3 asks for.
