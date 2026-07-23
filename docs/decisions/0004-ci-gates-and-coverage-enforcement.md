# 0004. CI gates: Makefile targets, a scripted Rust coverage gate, Dependabot

## Status
Accepted (2026-07-23)

## Context

PROJECT.md §5 asks for a lint → test → build pipeline and §4 for coverage
thresholds enforced from day one (issue #3). Three details needed deciding:

1. **What CI actually runs.** A workflow that inlines `npx vitest run --coverage`
   and `cargo clippy` drifts from the local gate the moment either changes.
2. **How to enforce Rust coverage while the backend is empty.**
   `cargo llvm-cov --fail-under-lines 100` reports 0 coverable lines as 0% and
   exits 1, so the gate would be red on `main` until #8 lands the parser — the
   opposite of "green pipeline on main". Stable LLVM also has no branch data
   (that needs a nightly toolchain), so the §4 wording "lines/branches/functions"
   has no literal Rust equivalent.
3. **Automated dependency bumps.** The spec says "always the newest stable
   stack", which only holds if something keeps bumping it.

## Decision

- **CI jobs call `make` targets** — `make lint`, `make coverage`, `make build-ci`,
  `make commitlint` — never raw npm/cargo commands. The Makefile stays the single
  command interface for humans, agents and CI. The shared setup (Tauri's Linux
  packages, Node, Rust, caches) is a local composite action,
  `.github/actions/setup`.
- **CI builds compile-only**: `make build-ci` runs `tauri build --no-bundle`.
  Producing deb/rpm/AppImage artifacts is the release workflow's job (#21) and
  adds minutes without adding signal to a per-PR gate.
- **The Rust coverage gate is `scripts/rs-coverage-gate.mjs`**: it reads
  `cargo llvm-cov --json --summary-only` and requires 100% of **lines, functions
  and regions**, treating an empty measurement set as "nothing to regress yet".
  `regions` stands in for branches — it is the closest stable-toolchain metric.
  Bootstrap (`main.rs`, `lib.rs`) is excluded via `--ignore-filename-regex`.
- **Frontend thresholds are per glob** in `vitest.config.ts` (100% for `core/`,
  `profiles/`, `features/registry.ts`; 90% for `features/**/*.vue` and
  `controls/`). A glob matching no files passes and starts biting on the first
  file, so layers can land one at a time without loosening the policy.
- **Dependabot, not Renovate**: native to GitHub (no app to install on the
  owner's account), covers npm, cargo and github-actions. Minor/patch updates are
  grouped into one PR per ecosystem per week; majors arrive separately.

## Consequences

- Changing a gate means changing one `make` target; CI follows automatically.
- The Rust gate is honest about an empty crate today and turns strict the moment
  `backend/` gets its first line — but it is a script to maintain, and it must be
  revisited if the project ever moves to nightly for real branch coverage.
- Grouped Dependabot PRs still run the full pipeline, so a bad bump is caught
  before review.
- Bundling is unverified until #21 — a packaging-only breakage (icons, bundle
  metadata) will not be caught by this pipeline.
- Branch protection requiring these checks is repo configuration, not code; it is
  applied by the owner (see the issue #3 hand-off) rather than by this PR.
