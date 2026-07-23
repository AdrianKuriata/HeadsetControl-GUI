# Testing strategy

> **Status:** specified (PROJECT.md §4). Tooling lands with issues #3 (CI gates),
> #8 (contract fixtures), #13 (Playwright E2E), #14 (smoke E2E) — reconcile this
> doc in those PRs.

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

## Coverage policy (CI-enforced, build red below threshold)

| Threshold | Scope |
|---|---|
| **100%** lines/branches/functions | `src/core/`, `src/core/stores/`, `src/profiles/`, `src/features/registry.ts` (Vitest v8); Rust parser/adapter/state machine (`cargo-llvm-cov`) |
| **90%** | UI components: `src/features/*.vue`, `src/controls/` |
| excluded | generated code (`*.gen.ts`), bootstrap (`main.ts`, `main.rs`), config files |

E2E does **not** count toward coverage — it measures flows, not lines.

## Commands

```bash
make ci           # full local gate: lint + coverage + E2E — run before every push
make fe-coverage  # Vitest with thresholds
make rs-coverage  # cargo-llvm-cov with thresholds
make fe-e2e       # Playwright on MockBackend
```
