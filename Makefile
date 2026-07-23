# HeadsetControl-GUI — developer commands.
# Single entry point for humans, Claude, and CI. Keep targets in sync with
# package.json scripts (npm) and the CI workflow (see CLAUDE.md "Validate locally").

CARGO := cargo --locked
RS_MANIFEST := src-tauri/Cargo.toml

# Commit range checked by `make commitlint`; CI overrides it with the PR's range.
COMMITLINT_FROM ?= origin/main
COMMITLINT_TO ?= HEAD

.DEFAULT_GOAL := help

.PHONY: help setup dev build build-ci gen \
        fe-lint fe-typecheck fe-test fe-coverage fe-e2e fe-check \
        rs-fmt rs-lint rs-test rs-coverage rs-check \
        commitlint format lint test coverage ci

help: ## List available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

## ── Project ─────────────────────────────────────────────

setup: ## Install all dependencies (npm + cargo fetch)
	npm install
	$(CARGO) fetch --manifest-path $(RS_MANIFEST)

dev: ## Run the app in development mode
	npm run tauri dev

build: ## Production build (bundles via tauri)
	npm run tauri build

build-ci: ## Compile-only build gate (no deb/rpm/AppImage bundling)
	npm run tauri build -- --no-bundle

gen: ## Regenerate src/core/types.gen.ts from Rust (tauri-specta)
	npm run gen

## ── Frontend ────────────────────────────────────────────

fe-lint: ## ESLint + Prettier check
	npm run lint

fe-typecheck: ## vue-tsc type check
	npm run typecheck

fe-test: ## Vitest unit/component tests
	npm test

fe-coverage: ## Vitest with coverage thresholds (100% logic / 90% UI)
	npm run coverage

fe-e2e: ## Playwright E2E on MockBackend
	npm run test:e2e

fe-check: fe-lint fe-typecheck fe-coverage ## All frontend gates

## ── Rust ────────────────────────────────────────────────

rs-fmt: ## rustfmt check
	$(CARGO) fmt --manifest-path $(RS_MANIFEST) --check

rs-lint: ## clippy, warnings are errors
	$(CARGO) clippy --manifest-path $(RS_MANIFEST) --all-targets -- -D warnings

rs-test: ## cargo tests (incl. contract fixtures)
	$(CARGO) test --manifest-path $(RS_MANIFEST)

rs-coverage: ## cargo-llvm-cov with thresholds (100% parser/adapter/state machine)
	node scripts/rs-coverage-gate.mjs

rs-check: rs-fmt rs-lint rs-coverage ## All Rust gates

## ── Combined ────────────────────────────────────────────

commitlint: ## Check this branch's commit messages (Conventional Commits)
	npx --no -- commitlint --from $(COMMITLINT_FROM) --to $(COMMITLINT_TO)


format: ## Auto-format everything (prettier + rustfmt)
	npm run format
	$(CARGO) fmt --manifest-path $(RS_MANIFEST)

lint: fe-lint fe-typecheck rs-fmt rs-lint ## All linters, no tests

test: fe-test rs-test ## All unit/component tests, no coverage gates

coverage: fe-coverage rs-coverage ## All tests with coverage thresholds

ci: lint coverage fe-e2e ## Full local gate — run before every push
