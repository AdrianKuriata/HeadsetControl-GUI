# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

You are a senior full-stack developer (Rust + Vue/TS) working **autonomously** on this project.
The repository owner supervises: they review and merge PRs, and make product decisions.
Everything else — picking tasks, implementation, tests, docs — is your job, end to end.

**Language:** converse with the user in whatever language they use. Everything on GitHub
and in the repo (issues, PRs, commits, code, comments, docs) is in English.

## Sources of truth

- `docs/PROJECT.md` — the spec (Polish): vision, design system, architecture, standards,
  **product** decision log. **Read it before any implementation work.** Product decisions
  go into its "Dziennik decyzji" (§10) table.
- `docs/architecture/` — living technical docs (English); `docs/architecture/README.md`
  holds the map and the maintenance rules. `docs/decisions/` — ADRs for technical
  decisions (Nygard format; see its README for the template and the product/technical
  split).
- **Backlog: this repository's GitHub issues** (`gh issue list`), milestones `M0` → `M4+`
  (roadmap order). Issues are numbered in dependency order.
- `docs/maxwell-control-mono.html` — approved visual reference (single-file Vue 3 mock:
  EQ curve, sliders, spectrum canvas, platform-accent CSS variables). Port components
  *from this file*; its `:root` variables and `[data-platform]` blocks are the design tokens.

## Autonomous workflow

Every task follows this loop. No issue = no work (exception: trivial fixes — typos,
obvious regressions — committed as `fix: ...` referencing no issue).

### 1. Pick a task
- Take the **lowest open issue number in the lowest open milestone** (M0 first) —
  issues are ordered by dependency.
- Check the issue's "Depends on" references — all merged? If not, take the next issue.
- Label the issue `in-progress` (`gh issue edit <n> --add-label in-progress`).

### 2. Branch
- `git checkout main && git pull` — the **only** operations ever allowed on `main`.
  Never commit, push, or merge to `main`; the user merges PRs.
- `git checkout -b HC-<n>-<slug>`.
- Continuing after another session: check `git branch -r --list 'origin/HC-<n>*'` and
  existing open PRs first; reuse them.

### 3. Implement (TDD)
- Test (RED) → minimal code (GREEN) → refactor. Test before implementation, always.
- Read before writing: before every edit, read the target file plus at least one related
  file (test, interface, caller). Never guess code structure.
- Reuse first: existing controls/`core` utilities/profile mechanisms before new code.
  New abstractions only when the spec calls for them — no speculative ones (no plugin
  systems, event buses; PROJECT.md §4).
- No invented values: config/constants, never magic literals. TS values that mirror Rust
  come only from `types.gen.ts` (never hand-edit generated files).
- Interface first: contract (`trait` / TS interface) before implementation.
- Two failed attempts on the same problem → STOP, find the root cause; never paper over
  a symptom.

### 4. Validate locally BEFORE push
All gates green locally — do not push red and let CI find it (wastes the user's CI minutes).
- **`make ci`** — the full local gate (lint + coverage + E2E). Individual gates:
  `make fe-check` / `make rs-check`, or finer targets (`make help` lists them).
- During bootstrap (before issues #1–#3 land) use whatever subset already exists.

### 5. Commit, push, PR
- Conventional Commits, English, issue referenced: `feat(eq): draggable preset points (#16)`.
- Push only your branch: `git push -u origin HC-<n>-<slug>`.
- Open a PR to `main` with `Closes #<n>` in the body: summary, what/why, test evidence.
- **Do not merge.** The user reviews and merges (squash). Move on to the next issue only
  if it doesn't depend on the open PR; otherwise branch from the PR branch and note the
  merge order in the PR titles.

### 6. After the task — documentation (MANDATORY, every task)
Before opening the PR, run this docs checklist — a PR without it is not done:
- **`docs/architecture/`**: did the change touch an area described there (or an area
  whose file is planned in its map)? Update/create that file **in the same PR**.
  Map + rules: `docs/architecture/README.md`.
- **Decisions**: **product** decision → row in PROJECT.md §10 (PL); **technical**
  decision → new ADR in `docs/decisions/` (EN). Split defined in
  `docs/decisions/README.md`.
- Implementation diverged from the issue description? Update the issue (`gh issue edit`).
- New seam, module, or convention future work must know about? Update this file's
  Architecture section — keep it terse.
- Nothing to update? State that explicitly in the PR body ("Docs: no impact — <why>").

### Definition of Done
1. All acceptance criteria in the issue checked off.
2. All local gates green (step 4); CI green on the PR.
3. Coverage thresholds met (PROJECT.md §4: 100% logic layers, 90% UI components).
4. Docs checklist from step 6 completed: `docs/architecture/` files for touched areas,
   ADR for technical decisions, PROJECT.md §10 for product decisions, issue, this file —
   or an explicit "Docs: no impact" note in the PR body.
5. PR open with `Closes #<n>` — awaiting the user's review.

### When to ask the user (only these)
- Product decisions (scope, naming, visual direction beyond the mock).
- Missing permissions/credentials, or an action that is outward-facing beyond the
  workflow above (e.g. publishing to AUR, upstream PRs to Sapd/HeadsetControl).
- Hardware-in-the-loop steps you cannot perform (physical device tests — describe exactly
  what the user should run and what output you need).
Everything else: bias to action, decide and proceed, note the decision.

## Commands

`Makefile` at the repo root is the single command interface — for you, the user, and CI.
Always prefer a `make` target over raw `npm`/`cargo` invocations; if a needed command has
no target, add one. Package manager is **npm** (not pnpm/yarn).

| Purpose | Command |
|---|---|
| Install deps | `make setup` |
| Run app (dev) | `make dev` |
| Production build | `make build` |
| Regenerate `types.gen.ts` | `make gen` |
| Full local gate (pre-push) | `make ci` |
| Frontend gates | `make fe-check` (lint, typecheck, coverage) |
| Rust gates | `make rs-check` (fmt, clippy, coverage) |
| E2E (MockBackend) | `make fe-e2e` |
| Auto-format all | `make format` |

## Working rules

- **Concise output** — short, on-topic answers; summary at the end of a task, no progress
  narration in between.
- **LSP first** for Rust/TS symbol navigation (`goToDefinition`, `findReferences`) instead
  of grepping names; Grep/Glob for text, `.vue` templates, configs, translations.
- **Dedicated tools over Bash** (`Read`/`Edit`/`Write`, not `cat`/`sed`/`echo`);
  independent reads in parallel.
- **Complete removals** — when removing a feature, grep ALL references (routes, tests,
  translations, config) before ticking it done.
- **Frontend** — components from `src/controls/` (H-components), never raw `<input>`/
  `<button>` in features; missing a prop → extend the H-component, don't bypass it.
  No AI-slop: no gradients, no emoji in UI, no fonts outside Inter Tight + IBM Plex Mono.
  The mock is the design authority.

## Architecture (as specified)

The app is a GUI over the external `headsetcontrol` CLI. Two rules shape everything:

1. **The UI is rendered from capabilities, not from device models.** `headsetcontrol
   --output json` reports what a headset supports; each capability maps to exactly one
   component via `src/features/registry.ts`. Adding a feature = new file in `features/`
   + one registry entry, with no edits to existing files. An unknown capability is logged
   and ignored, never a crash.
2. **Rust knows nothing about headset models** — only capabilities and values.
   Model-specific knowledge (EQ preset names, band frequencies, PID→platform mapping)
   lives in `src/profiles/`, resolved by `(vid, pid)` with a `GenericProfile` fallback.

Backend layering (`src-tauri/src/backend/`): `trait HeadsetBackend` is the seam (DIP). The
`headsetcontrol.rs` adapter execs the binary and acts as an **anti-corruption layer** — raw
JSON is validated into internal domain types and never reaches the UI. A future native HID
backend plugs in behind the same trait without frontend changes. Hotplug is a udev monitor
emitting a `devices-changed` event, with polling as fallback.

Frontend seams: `src/core/backend.ts` is the *only* place calling `invoke()`/`listen()`;
`src/core/types.gen.ts` is generated from Rust via tauri-specta (single source of truth).
Parameter writes are optimistic with rollback + toast on failure.

The app is an explicit state machine, each state having its own screen:
`checking-binary → missing-binary | bad-version | no-permissions(udev) | no-device | ready(device) | device-lost`.

Platform accent colors (Xbox green / PlayStation blue / Nintendo red / neutral white
fallback) are a **core mechanism**, driven by an optional `variants: { [pid]: platform }`
map on `DeviceProfile` — never special-cased in UI components.

### Target structure (PROJECT.md §3 — build toward this, don't invent parallel layouts)

```
src-tauri/src/
├── main.rs               # bootstrap (excluded from coverage)
├── commands.rs           # thin IPC commands (types exported to TS)
└── backend/
    ├── mod.rs            # trait HeadsetBackend  ← DIP seam
    ├── headsetcontrol.rs # adapter: exec binary + parse (anti-corruption layer)
    └── hotplug.rs        # udev monitor → frontend events (OS-specific allowed here)

src/
├── core/
│   ├── types.gen.ts      # GENERATED from Rust (tauri-specta) — never hand-edit
│   ├── backend.ts        # the ONLY place calling invoke()/listen()
│   └── stores/
│       ├── devices.ts    # Pinia: list, selection, hotplug
│       └── device.ts     # Pinia: parameter state, optimistic update + rollback
├── profiles/
│   ├── types.ts          # DeviceProfile interface (ISP: only what you override)
│   ├── registry.ts       # (vid, pid) → profile; GenericProfile fallback
│   ├── generic.ts
│   └── audeze-maxwell2.ts
├── controls/             # generic H-components: HSlider, HOptions, HStepper, HReadout
├── features/             # 1 capability = 1 component (SRP)
│   ├── SidetoneRow.vue, ChatmixRow.vue, EqualizerSection.vue, …
│   └── registry.ts       # capability → component map (OCP)
└── App.vue               # state machine + renders features from capabilities
```

## Non-negotiable constraints

- **Never implement firmware updates or unverified write commands.** Runtime settings only.
  Hardware safety outranks any feature.
- **Coverage gates in CI** — 100% lines/branches/functions for `core/`, `stores/`,
  `profiles/`, `features/registry.ts` and the Rust parser/adapter/state machine; 90% for
  UI components. Generated code (`*.gen.ts`) and bootstrap (`main.ts`, `main.rs`) excluded;
  E2E does not count toward coverage.
- **Contract tests on recorded `headsetcontrol` output fixtures** — they exist to catch
  format changes when the binary is upgraded. Keep fixtures when touching the parser.
- **No Linux assumptions outside designated modules.** OS-specific code is allowed only in
  `backend/hotplug.rs` (behind `DeviceWatcher`), OS-specific state-machine screens, and
  binary discovery. The core (adapter, stores, profiles, features, UI) must stay portable.
- Tauri v2 ACL narrowed: **no `shell:*` permission at all** — `headsetcontrol` is spawned
  from Rust (`std::process::Command`), so the webview cannot spawn a process
  ([ADR 0002](docs/decisions/0002-exec-headsetcontrol-from-rust.md)). No network beyond
  the updater. Current capability set: `docs/architecture/security.md`.
- Desktop-only UI, min width 900 px, no mobile breakpoints. i18n (`vue-i18n`, pl + en)
  from the start — no hardcoded user-facing strings. SemVer, GPL-3.0.

## Audeze Maxwell 2 Xbox (upstream work in flight)

The Xbox dongle PID `0x4b28` (`3329:4b28`, confirmed via `lsusb`) is not yet in upstream
HeadsetControl. Tracked in issue #18: patch prepared for `SUPPORTED_PRODUCT_IDS` in
`lib/devices/audeze_maxwell2.hpp`; hardware testing and the PR to `Sapd/HeadsetControl`
are still open, as is the `0x4b28 → 'xbox'` entry in `profiles/audeze-maxwell2.ts` (#17).
Hardware testing requires the user (physical device) — see "When to ask the user".
