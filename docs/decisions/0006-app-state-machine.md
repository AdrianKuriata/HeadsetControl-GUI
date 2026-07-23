# 0006. The app state machine: pure transitions, screens as data, a placeholder probe

## Status
Accepted (2026-07-23)

## Context

PROJECT.md §3.3 defines an explicit state machine where every state owns a full
screen, and says it "belongs to `src/App.vue`" (issue #5). Building it raised
four questions the spec leaves open.

1. **Where the logic lives.** Transitions written inline in a component are
   testable only by mounting it, which is exactly the coverage the 100% logic
   layer is meant to have.
2. **Where the screens live.** §3.2's layout has `controls/` (generic widgets)
   and `features/` (one capability = one component). A full-window screen is
   neither.
3. **How `App.vue` picks a screen.** A `v-if` chain is the obvious form.
4. **What drives the probe** while binary detection (#9) does not exist.

## Decision

- **`core/state-machine.ts` holds the machine**: `AppState`, `AppEvent` and a
  pure, total `transition(state, event)`. `App.vue` holds the current state and
  dispatches events; it decides nothing. Every transition in the spec's diagram
  is a unit test.
- **Screens live in `src/screens/`** — one component per state, plus
  `screens/registry.ts`. This extends §3.2's layout with a third component
  layer; screens are the only place OS-specific *content* (install instructions,
  udev rules) is allowed on the frontend, which is another reason to keep them
  apart from `features/`.
- **The state → screen mapping is data**, not a `v-if` chain: `SCREENS` maps
  each state kind to its component and `screenProps(state)` supplies that
  screen's props. `App.vue` renders `<component :is>` and has nothing to branch
  on, so a new state is one registry entry — the same OCP shape as
  `features/registry.ts`.
- **The probe is a placeholder**: `core/probe.ts` calls `listDevices()` and maps
  *any* backend error to `missing-binary`, which is the screen that tells the
  user how to get the binary. #9 replaces the mapping with real detection
  (found? version? udev permissions?), and `ProbeFailure` already carries those
  three cases. An error that is not a `BackendCallError` is rethrown rather than
  disguised as a probe failure — that would be a bug in our own code.
- **A hotplug refresh reuses the probe**, so a backend that starts failing
  mid-session keeps the current screen instead of raising an unhandled
  rejection.

## Consequences

- The machine is testable without a DOM, and `App.vue` needs only integration
  tests (mount, hotplug, retry, unmount).
- `device-lost` + a *different* headset resolves to `no-device`, exactly as the
  spec's diagram says. Choosing between several connected devices belongs to the
  devices store (#11), which may revisit this.
- Screens carry hardcoded English strings until vue-i18n lands (#7), and
  placeholder markup until the design system lands (#6). Both are flagged in the
  components.
- `bad-version` and `no-permissions` are unreachable until #9 supplies the real
  probe, but their screens, props and transitions are already covered by tests.
