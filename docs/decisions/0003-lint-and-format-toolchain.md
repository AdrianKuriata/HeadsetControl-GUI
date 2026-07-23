# 0003. Lint and format toolchain: ESLint flat config, Prettier for code only, commitlint

## Status
Accepted (2026-07-23)

## Context

PROJECT.md §4 fixes the toolchain — ESLint 9+ (flat config) + `vue-tsc` + Prettier
on the frontend, `clippy` + `rustfmt` on the Rust side, Conventional Commits — and
requires CI to block merges on it (issue #2). Several details are left open, and
each of them shapes every later PR:

- **ESLint vs. Prettier overlap.** Two tools can format the same code; ESLint
  formatting rules and Prettier disagree by default.
- **Type-aware linting.** `typescript-eslint` can run rules that need the type
  checker (`parserOptions.projectService`). It doubles lint time and makes files
  outside `tsconfig.json` (`eslint.config.js`, `commitlint.config.js`) hard errors.
- **Prettier's reach.** Prettier also formats Markdown, and the repository is
  documentation-heavy: the Polish spec, ADRs, and the architecture docs are
  hand-written, and `docs/maxwell-control-mono.html` is the approved visual
  reference.
- **Where Conventional Commits are enforced.** The issue asks for a local hook or
  CI; nothing else in the repo installs git hooks yet.

## Decision

We will use:

- **ESLint (flat config, `eslint.config.js`)** with `@eslint/js` recommended,
  `typescript-eslint` recommended and `eslint-plugin-vue` `flat/recommended`, and
  **`eslint-config-prettier` last** to switch off every rule that would fight the
  formatter. ESLint checks correctness, Prettier owns formatting; we do **not**
  use `eslint-plugin-prettier` (formatting diffs as lint errors are noise).
- **No type-aware ESLint rules for now.** `vue-tsc --noEmit` (`make fe-typecheck`)
  is the type gate; ESLint stays syntactic. If a later feature needs a type-aware
  rule, this can be enabled with an explicit `tsconfig` for config files.
- **Prettier for code only.** Markdown (`*.md`) is in `.prettierignore`: Prettier
  rewrites list markers and continuation indentation in the hand-written specs and
  ADRs, which changes how they render on GitHub for no readability gain. Also
  excluded: `docs/maxwell-control-mono.html` (design authority, kept byte-identical),
  generated code (`src/core/types.gen.ts`, `src-tauri/gen/`), lockfiles, build and
  test artifacts.
- **rustfmt with a committed `rustfmt.toml`** (`style_edition = "2024"`,
  `max_width = 100`, Unix newlines — stable options only, so `cargo fmt --check`
  works on the stable toolchain), and clippy with `-D warnings` in `make rs-lint`.
- **commitlint (`@commitlint/config-conventional`) run by a husky `commit-msg`
  hook**, installed by `npm install` through the `prepare` script. `make commitlint`
  checks a whole branch (`origin/main..HEAD`) for CI (issue #3) and for commits made
  with hooks bypassed.

## Consequences

- `make lint` = ESLint + Prettier check + `vue-tsc` + `rustfmt --check` + clippy,
  and it is green on a clean tree; contributors run `make format` to fix style.
- The Vue SFC shim in `src/vite-env.d.ts` was dropped: it typed every component as
  `DefineComponent<{}, {}, any>` — which `typescript-eslint` rejects — while
  `vue-tsc` resolves `.vue` files directly and infers real props/emits types.
- Markdown style stays a human/agent convention (the ≤100-column wrapping the docs
  already use) rather than a machine-enforced one. Tables are aligned by hand.
- A bad commit message fails locally at commit time; `git commit --no-verify` still
  bypasses it, which is why CI re-checks the range.
- Adding type-aware linting later means adding a tsconfig for the root config files
  first — otherwise `eslint.config.js` itself becomes a lint error.
