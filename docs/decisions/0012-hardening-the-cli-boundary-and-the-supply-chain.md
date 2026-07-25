# 0012. Harden the CLI boundary and the supply chain

## Status
Accepted (2026-07-25)

## Context

A security and standards review of the whole codebase found the seams from
[ADR 0009](0009-headsetcontrol-adapter-seam.md)–[0011](0011-hotplug-watcher-seam.md)
sound, but the *edge* they isolate underspecified in ways that show up at
runtime rather than in a test:

- Every IPC command was a plain `#[tauri::command]`. Tauri runs those on the
  **main thread**, and each one blocks on a `headsetcontrol` process. With the
  refresh loop calling `deviceState` every 5 s, that stalls the event loop on a
  cadence — and a headset asleep behind its dongle makes the wait seconds long.
- `Command::output()` had no time limit. A wedged binary blocked its caller
  forever, with no way back short of killing the app. The frontend already
  modelled this (`MockFailure = { kind: "timeout" }`); Rust had no answer to it.
- Nothing serialised invocations. The hotplug loop lists devices on its own
  thread while the refresh loop reads values and the user writes parameters —
  three callers, one hidraw node, and a device that does not enjoy being opened
  twice at once.
- `Command::new("headsetcontrol")` left resolution to the OS. On Windows that
  search starts in the current working directory; a relative `PATH` entry has
  the same effect anywhere.
- `set_param` passed any `i32` straight through. Rust is the last gate before
  the hardware, and PROJECT.md §11 puts hardware safety above every feature.
- CI actions were referenced by tag and branch (`@v7`, `@stable`) — both mutable
  — and no job looked at dependency advisories at all.

## Decision

We will treat the process boundary as the security boundary and make each of the
above explicit:

1. Every command is `#[tauri::command(async)]`. The IPC surface stays sync Rust;
   only its dispatch moves off the main thread.
2. `ProcessRunner` bounds one invocation: killed after `CALL_TIMEOUT`, and at
   most `MAX_OUTPUT_BYTES` kept per stream (reading continues past the cap and
   discards, so the child never blocks on a full pipe).
3. `ProcessRunner` holds a `Mutex` — one `headsetcontrol` at a time, process
   wide. The rule belongs to the process spawn, not to the pure adapter above it.
4. The binary is resolved by an explicit `PATH` walk over **absolute** entries
   only, per call rather than cached so "install it, then press check again"
   still works.
5. `WRITE_FLAGS` carries an inclusive range per capability, copied from
   upstream's own `lib/capability_descriptors.hpp`. Out-of-range values are
   refused before anything is spawned.
6. Third-party actions are pinned to commit SHAs, and a `Dependency audit` job
   runs `make audit`: `npm audit --omit=dev --audit-level=high` and `cargo audit`
   gate, the full `npm audit` reports.

## Consequences

**Easier.** A hung or hostile `headsetcontrol` is now a bounded failure that
surfaces as a `BackendError` on the screen instead of a frozen window. Writes
that would reach hardware with a nonsense value stop in Rust, whatever the UI
does. Bumping an action is a Dependabot PR that changes a SHA and its comment.

**Harder.** The ranges in `WRITE_FLAGS` duplicate upstream's table and can drift
from it — the contract fixtures do not cover them, so a `headsetcontrol` upgrade
that widens a range needs the constant corrected by hand. `exec.rs` grew real
logic (the cap, the wait, the search) while staying excluded from the coverage
gate; the unit tests added there run but do not count, and only the smoke E2E
(#14) exercises a real spawn.

**Follow-up.** Per-device limits within these bounds remain profile knowledge
(#11/#17) — the range here is a sanity bound, not a device's true maximum. The
serialising `Mutex` means a slow call delays the ones behind it; if that becomes
visible, the fix is a shorter `CALL_TIMEOUT`, not a second runner.
