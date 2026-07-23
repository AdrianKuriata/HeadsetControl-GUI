# Contributing

Thanks for your interest! This project is a Linux GUI for
[headsetcontrol](https://github.com/Sapd/HeadsetControl), built with Tauri 2,
Vue 3 and Rust. It is developed largely by an AI agent under owner review — human
contributions are welcome and follow the same rules.

## Prerequisites

- Node.js ≥ 20 + npm (the project uses **npm**, not pnpm/yarn)
- Rust stable toolchain (edition 2024) with `cargo`
- Tauri 2 Linux system deps (`webkit2gtk` etc.) — see the
  [Tauri prerequisites](https://tauri.app/start/prerequisites/)
- Optional for real-device work: the `headsetcontrol` binary on `PATH`

## Getting started

```bash
make setup   # npm install + cargo fetch
make dev     # run the app in development mode
make help    # list all targets
```

`Makefile` at the repo root is the single command interface — prefer `make`
targets over raw `npm`/`cargo` calls.

## Before you open a PR

Run the full local gate:

```bash
make ci      # lint + coverage + E2E — must be green before pushing
```

Coverage thresholds are enforced in CI: 100% for logic layers (`core/`,
`stores/`, `profiles/`, Rust parser/adapter/state machine), 90% for UI
components. Tests come first — the project works TDD.

Tests live next to the code they cover as `*.spec.ts` (Vitest + Vue Test Utils);
`make test` runs them without thresholds, `make coverage` with. CI runs the same
`make` targets — lint → test → build — see
[docs/architecture/testing.md](docs/architecture/testing.md). `make ci` also runs
the E2E suite, which lands with issue #13.

## Code style

Style is machine-enforced, so don't hand-tune formatting:

```bash
make lint    # ESLint + Prettier check + vue-tsc + rustfmt --check + clippy
make format  # Prettier --write + cargo fmt
```

ESLint (flat config, `eslint.config.js`) checks correctness; Prettier owns
formatting. Prettier is deliberately limited to code — Markdown, the design
reference `docs/maxwell-control-mono.html`, and generated files are excluded.
Rust follows `rustfmt.toml`; clippy runs with `-D warnings`. The reasoning is in
[ADR 0003](docs/decisions/0003-lint-and-format-toolchain.md).

## Workflow

1. Pick an open issue (or open one — no issue, no work) and comment on it.
2. Branch from `main`: `HC-<issue>-<slug>`.
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/),
   in English, referencing the issue: `feat(eq): draggable preset points (#16)`.
   A husky `commit-msg` hook (installed by `make setup`) runs commitlint and
   rejects anything else; `make commitlint` checks a whole branch at once.
4. Open a PR to `main` with `Closes #<issue>` in the body. The owner reviews
   and squash-merges.

## Where things are documented

- [docs/README.md](docs/README.md) — map of all documentation
- [docs/architecture/](docs/architecture/README.md) — how the system works
  (update the relevant file in the same PR as your change — it is part of the
  Definition of Done)
- [docs/decisions/](docs/decisions/README.md) — record an ADR for any
  architectural decision your change makes

## Ground rules

- English everywhere in the repo (code, comments, commits, issues, PRs).
- No firmware updates or unverified write commands — runtime settings only.
- OS-specific code only in the designated modules (`backend/hotplug.rs`,
  OS-specific screens, binary discovery).
- License: GPL-3.0 — contributions are accepted under the same license.
