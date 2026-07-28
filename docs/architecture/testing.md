# Testing strategy

> **Status:** every tier below the hardware checklist is built — tooling and CI
> gates (#3), contract fixtures (#8), Playwright E2E (#13), smoke E2E (#14). The
> release checklist is #25.

The project works **TDD**: test (RED) → minimal code (GREEN) → refactor, test
always before implementation. `make ci` is the full local gate; CI enforces the
same thresholds and blocks merge.

## The pyramid

1. **Unit / integration** — the foundation; coverage lives here.
   - Rust (`cargo test`): parser, adapter, state machine — plus **contract
     tests** on recorded fixtures (below).
   - TS (Vitest): stores, profile registry, capability mapping, platform
     variants.
   - Components (Vue Test Utils): behaviors, interactions, ARIA — not pixels.
2. **E2E on MockBackend** (Playwright against a Vite build): full flows —
   startup verdicts, hotplug, device-lost and recovery, write-failure rollback.
   Deterministic; runs on every PR. See [below](#e2e-on-mockbackend).
3. **Smoke E2E on the real app**: `tauri-driver` (WebDriver) + xvfb in CI; a
   **fake `headsetcontrol`** on PATH answers with the recorded fixtures. The only
   automated test of the real IPC path. See [below](#smoke-e2e-on-the-real-app).
4. **Hardware checklist before release** (`RELEASE_CHECKLIST.md`, issue #25):
   real headset, physical hotplug, on-cup mute — the only tier CI cannot cover.
   Performed by the owner.

## Contract fixtures

`docs/fixtures/` holds `headsetcontrol --output json` output. The Rust adapter is
tested against it (`backend/headsetcontrol.rs`) so that **upgrading the binary and
breaking the format turns CI red** instead of crashing users. When touching the
parser: keep existing fixtures, add new ones for new formats.

| Fixture | Source | Covers |
|---|---|---|
| [`maxwell2-xbox-output-json.json`](../fixtures/maxwell2-xbox-output-json.json) | recorded | a healthy device: capabilities, battery level, chatmix |
| [`maxwell2-xbox-partial-errors.json`](../fixtures/maxwell2-xbox-partial-errors.json) | recorded (headset powered off) | present but unreadable — `status: "partial"`, `level: -1`, an `errors` map. A missing udev rule produces the same shape, so #9 cannot tell them apart from this alone |
| [`test-device-multi.json`](../fixtures/test-device-multi.json) | recorded (`--test-device`) | two devices at once, and the CLI's full capability vocabulary |
| [`write-actions-mixed.json`](../fixtures/write-actions-mixed.json) | recorded | the write shape: an `actions` array with one success and one failure |
| [`no-devices.json`](../fixtures/no-devices.json) | hand-authored | nothing connected — an empty list, not an error |
| [`unknown-capability.json`](../fixtures/unknown-capability.json) | hand-authored | `CAP_FROM_THE_FUTURE` passing through untouched; a charging battery |
| [`malformed-truncated.json`](../fixtures/malformed-truncated.json) | hand-authored | output cut off mid-string — must be rejected, never half-read |
| [`old-release.json`](../fixtures/old-release.json) | hand-authored | the healthy output as a *released* `3.1.0` would report it — the version gate's reject case (#9) |
| [`write-action-success.json`](../fixtures/write-action-success.json) | hand-authored | a write everything accepted: `actions` with one success and no devices |

Recorded fixtures are byte-identical to what the binary printed, so
`docs/fixtures/` is in `.prettierignore` (the truncated one cannot be parsed at
all, which is the point). Hand-authored ones exist because hardware cannot
produce them on demand.

## Where tests live

Unit and component tests sit next to the code they cover, as `*.spec.ts`
(`src/core/backend.spec.ts`, `src/controls/HSlider.spec.ts`). Vitest picks up
`src/**/*.spec.ts`; jsdom is the environment, Vue Test Utils mounts components.
Rust tests live in `#[cfg(test)]` modules beside the code, contract tests read
the fixtures below.

## E2E on MockBackend

`e2e/*.e2e.ts`, run by `make fe-e2e` (and as part of `make ci`). Playwright
builds the app with `vite build --mode mock` — `.env.mock` sets
`VITE_BACKEND=mock` — serves it with `vite preview`, and drives it in Chromium.
There is no Tauri shell and no binary: the backend is `src/core/mock-backend.ts`.

Two globals make that scriptable, and both exist **only** in the mock build:

| Global | Set by | Purpose |
|---|---|---|
| `__headsetDeckScenario` | the test, before the bundle runs | what the mock **boots** with: devices, detection verdict, latency, failures |
| `__headsetDeckMock` | the app, on boot | the live mock — `setDevices()` fires hotplug, `fail()` makes the device refuse, `writes` records what was sent |

The boot global matters because the app probes on mount: a scenario parked
afterwards would only be seen by the next event, so "no headset at startup" or
"binary too old" could not be tested at all.

**Determinism rules** (the acceptance criterion of #13):

- `retries: 0`. A flake is a bug; retrying would hide it.
- No `waitForTimeout` anywhere — every assertion is a Playwright web-first
  expectation that polls the DOM.
- No real device, no real timers: events come from the mock, and the mock's
  default latency is 0.

Selectors are `data-part` / `data-capability` attributes and ARIA roles, never
CSS classes — the same rule the component tests follow.

Two flows named in #13 are **not** covered here yet. Choosing between several
connected headsets needs a picker that does not exist (the store supports it,
[ADR 0013](../decisions/0013-stores-optimistic-writes.md)). Platform accent
switching has its mechanism since #15 — unit- and component-tested — but no
device maps to a platform until the first real profile lands (#17), so the
end-to-end flow belongs to that PR.

## Smoke E2E on the real app

`smoke/run.mjs`, run by `make smoke`. It launches the **built Tauri binary** —
release build, real webview, real Rust adapter — under `tauri-driver`, once per
scenario, and drives it over WebDriver.

What is faked is exactly one thing: `smoke/fake-headsetcontrol`, a POSIX shell
script placed on the app's `PATH` under the name `headsetcontrol`. It prints a
fixture chosen by `SMOKE_SCENARIO`, appends every argument list it was called
with to `SMOKE_LOG`, and never touches a device. That log is how the suite
asserts the adapter assembled the CLI arguments the binary actually wants
(`-d 0x3329:0x4b28 -s 64 --output=json`).

| Scenario | What it proves |
|---|---|
| `healthy` | the device, its capability rows and its battery, parsed by the real adapter |
| `no-devices` | an empty list is "nothing connected", not an error |
| `old-release` | the version gate rejects a released `3.1.0` (#9) |
| `malformed` | output the parser cannot read is refused, never half-read |
| `hang` | a binary that never answers is killed by the call timeout ([ADR 0012](../decisions/0012-hardening-the-cli-boundary-and-the-supply-chain.md)) |
| *(no binary)* | an empty `PATH` lands on the missing-binary screen |
| `healthy` + write | the write reaches the CLI with the right arguments, and the value sticks |
| `write-refused` | an `actions` entry reporting failure — with exit code 0 — rolls the value back and toasts |

Three notes on how it stays deterministic:

- **The locale is pinned** (`LANG`/`LANGUAGE`/`LC_ALL`), because the app reads
  `navigator.language` and the assertions name the English copy. Text is matched
  case-insensitively — much of the design renders uppercase through CSS.
- **The drivers are resolved to absolute paths** before the cases run: one case
  hands the app an empty `PATH`, and the harness must survive it.
- **No client library.** WebdriverIO and friends negotiate capabilities
  (BiDi sockets, vendor extensions) that `tauri-driver` rejects the whole session
  over; the four WebDriver calls this needs are plain HTTP.

Running it locally needs `tauri-driver` (`cargo install tauri-driver`),
`WebKitWebDriver` (`webkit2gtk-driver`), a display, and a release build
(`make build-ci`). It is deliberately **not** part of `make ci`: those are the
gates every change runs, and this one needs a toolchain a contributor may not
have. CI runs it on every PR.

## Coverage policy (CI-enforced, build red below threshold)

| Threshold | Scope |
|---|---|
| **100%** lines/branches/functions | `src/core/`, `src/core/stores/`, `src/profiles/`, `src/features/*.ts` (Vitest v8); Rust parser/adapter/detection/hotplug (`cargo-llvm-cov`) |
| **90%** | UI components: `src/features/*.vue`, `src/controls/` |
| excluded | generated code (`*.gen.ts`), bootstrap (`main.ts`, `main.rs`, `lib.rs`), thin IPC glue (`commands.rs`, covered by the smoke E2E), config files |

E2E does **not** count toward coverage — it measures flows, not lines.

Thresholds are configured per glob in [`vitest.config.ts`](../../vitest.config.ts):
a layer that does not exist yet has nothing to fail on, and starts being enforced
the moment it gets its first file. `src/App.vue` is the app shell and belongs to
no bucket; it is still tested.

The Rust side runs through [`scripts/rs-coverage-gate.mjs`](../../scripts/rs-coverage-gate.mjs)
rather than `cargo llvm-cov --fail-under-lines`: with the backend modules still
empty, llvm-cov reports "0 coverable lines" as 0% and would keep CI red for no
reason. The script fails on a real regression (lines, functions and regions must
be 100%) and stays quiet on an empty measurement set. Branch coverage is not part
of the Rust gate — LLVM branch data needs a nightly toolchain, so `regions` is
checked as the stable equivalent.

## CI

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on every PR and
on `main`. Jobs are split **by stack, not by stage**, and run in parallel:

| Job | Runs | Needs |
|---|---|---|
| Frontend | `make fe-check` — ESLint, Prettier, vue-tsc, Vitest + thresholds | Node only |
| Rust | `make rs-check` — rustfmt, clippy, coverage gate | Node, Rust, WebKit packages |
| Build | `make build-ci` — `tauri build --no-bundle` | Node, Rust, WebKit packages |
| E2E | `make fe-e2e` — Playwright on the mock build | Node, Chromium (cached) |
| Smoke E2E | `xvfb-run make smoke` — the built app under `tauri-driver` | Node, Rust, WebKit packages, `webkit2gtk-driver`, xvfb |
| Commit messages | `make commitlint` over the PR's commit range | Node only |

Every job calls the same `make` target a developer runs locally, so CI and the
local gate cannot drift. The shared prelude for the Rust-side jobs — Tauri's Linux
packages, Node with npm cache, Rust with `Swatinem/rust-cache` — lives in
[`.github/actions/setup`](../../.github/actions/setup/action.yml).

The split exists because the two stacks have wildly different fixed costs. The
whole frontend gate takes seconds and needs nothing installed; anything touching
Rust first spends ~50 s setting up (WebKit packages, toolchain, cache restore)
before it compiles. Measured on a warm cache: Frontend ~16 s, Rust ~85 s (of
which `make rs-check` is ~25 s), Build ~95 s. On a cold cache the two Rust jobs
take 3–4 min because the whole Tauri dependency tree is compiled.

Two caches carry that: npm via `actions/setup-node`, and `~/.cargo` plus
`src-tauri/target` via `Swatinem/rust-cache`. **The rust-cache key includes the
job name** — renaming a CI job silently costs a full cold rebuild until it
repopulates. The WebKit packages are installed fresh each run on purpose: caching
the `.deb` files was measured at ~10 s saved per job, which did not pay for the
extra machinery.

`make build-ci` compiles the app without producing deb/rpm/AppImage artifacts;
bundling belongs to the release workflow (#21).

## Commands

```bash
make ci           # full local gate: lint + coverage + E2E — run before every push
make test         # Vitest + cargo test, no thresholds
make fe-coverage  # Vitest with thresholds
make rs-coverage  # cargo-llvm-cov with thresholds
make fe-e2e       # Playwright on MockBackend (lands with #13)
make build-ci     # compile-only build gate
```

`make ci` stays red until the E2E suite lands in #13 — `make lint` and
`make coverage` are the working local gate until then.
