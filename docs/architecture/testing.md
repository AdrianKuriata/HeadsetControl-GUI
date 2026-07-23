# Testing strategy

> **Status:** unit/component tooling and the CI gates are in place (#3). Still to
> land: contract fixtures (#8), Playwright E2E (#13), smoke E2E (#14) — reconcile
> this doc in those PRs.

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
2. **E2E on MockBackend** (Playwright against a Vite build, issue #13): full
   flows — hotplug, device-lost, write-failure rollback, device selection,
   platform themes. Deterministic; runs on every PR.
3. **Smoke E2E on the real app** (issue #14): `tauri-driver` (WebDriver) + xvfb
   in CI; a **fake `headsetcontrol` binary** on PATH returns JSON fixtures,
   including error scenarios (missing binary, bad format, timeout). Exercises
   the real IPC path.
4. **Hardware checklist before release** (`RELEASE_CHECKLIST.md`, issue #25):
   real headset, physical hotplug, on-cup mute — the only tier CI cannot cover.
   Performed by the owner.

## Contract fixtures

`docs/fixtures/` holds recorded `headsetcontrol --output json` outputs (first:
[`maxwell2-xbox-output-json.json`](../fixtures/maxwell2-xbox-output-json.json)).
The Rust parser is tested against them so that **upgrading the binary and
breaking the format turns CI red** instead of crashing users. When touching the
parser: keep existing fixtures, add new ones for new formats.

## Where tests live

Unit and component tests sit next to the code they cover, as `*.spec.ts`
(`src/core/backend.spec.ts`, `src/controls/HSlider.spec.ts`). Vitest picks up
`src/**/*.spec.ts`; jsdom is the environment, Vue Test Utils mounts components.
Rust tests live in `#[cfg(test)]` modules beside the code, contract tests read
the fixtures below.

## Coverage policy (CI-enforced, build red below threshold)

| Threshold | Scope |
|---|---|
| **100%** lines/branches/functions | `src/core/`, `src/core/stores/`, `src/profiles/`, `src/features/registry.ts` (Vitest v8); Rust parser/adapter/state machine (`cargo-llvm-cov`) |
| **90%** | UI components: `src/features/*.vue`, `src/controls/` |
| excluded | generated code (`*.gen.ts`), bootstrap (`main.ts`, `main.rs`, `lib.rs`), config files |

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

Two caches carry that: `Swatinem/rust-cache` for `~/.cargo` and
`src-tauri/target`, and an `actions/cache` entry for the `.deb` files. **The
rust-cache key includes the job name** — renaming a CI job silently costs a full
cold rebuild until it repopulates.

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
