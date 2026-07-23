# 0002. Execute headsetcontrol from Rust, without the Tauri shell plugin

## Status
Accepted (2026-07-23)

## Context

The app is a GUI over the external `headsetcontrol` CLI, so something has to
spawn that process. Tauri offers `tauri-plugin-shell`, whose ACL can be scoped
to a single allowed command, and the spec (PROJECT.md §4) demands the narrowest
possible capability set: shell access **only** for the `headsetcontrol` binary,
no network beyond the updater.

Scoping the shell plugin still hands the webview an IPC command that spawns a
process. The argument scope is expressed as a regex per argument position, which
has to be widened every time the adapter grows a new flag — and every widening is
a step toward "the frontend can run arbitrary `headsetcontrol` invocations".

The architecture already puts process execution on the Rust side:
`backend/headsetcontrol.rs` is the anti-corruption layer, and the UI is supposed
to see validated domain types rather than CLI output (PROJECT.md §3.1).

## Decision

We will spawn `headsetcontrol` from Rust with `std::process::Command` inside
`backend/headsetcontrol.rs`, and we will **not** add `tauri-plugin-shell`. The
frontend reaches the binary only through the thin IPC commands in `commands.rs`.

The capability set in `src-tauri/capabilities/default.json` therefore contains
no `shell:*` and no `http:*` permission at all — only `core:default` plus the
plugins the app actually uses (`log`, `store`, `notification`).

## Consequences

- The tightest possible reading of PROJECT.md §4: the webview cannot spawn a
  process at all, so there is no argument scope to keep correct as the adapter
  evolves. Verifying the ACL is reading one short file.
- Command construction, timeouts and error mapping live in one Rust module,
  which is also where the contract tests and the 100 % coverage gate apply.
- Binary discovery (PATH lookup, Flatpak/AppImage paths) becomes Rust's job —
  see issue #9.
- A future native HID backend replaces the adapter behind `trait
  HeadsetBackend` with no ACL change, because there was never a shell permission
  to remove.
- If some later feature genuinely needs shell access from the webview, this ADR
  has to be superseded rather than quietly amended.
