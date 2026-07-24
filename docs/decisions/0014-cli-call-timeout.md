# 0014. A bounded `headsetcontrol` call, and what a hung binary looks like

## Status
Accepted (2026-07-24)

## Context

Every call into the CLI went through `Command::output()`, which blocks until the
child exits. A `headsetcontrol` that never answers — a wedged USB stack, a
device that stops responding mid-transfer, a wrapper script waiting on something
— would therefore block the caller forever:

- **at startup**, detection runs before the first screen is chosen, so the app
  would sit on "checking headsetcontrol" with nothing to say and no way out;
- **at runtime**, the hotplug thread and the value refresh loop would each hang
  on their next call.

Issue #14 names a hung binary as one of the scenarios the smoke suite must
cover, and there was no behaviour to assert: the app simply never got anywhere.

## Decision

- **A call is bounded.** `ProcessRunner` spawns the child, waits for it in short
  steps, and on expiry kills it and returns an error naming the timeout.
  `CALL_TIMEOUT` is one `const` in `backend/exec.rs`, set to 5 s: generous
  enough for a busy USB hub — the CLI opens devices — and short enough that a
  person does not think the app is broken.
- **A timeout is "the binary cannot be run".** `CliRunner::run` already reports
  that as `Err`, which detection turns into `Detection::MissingBinary` — the
  screen that explains how to get a working `headsetcontrol`. No new state was
  invented for it: a fourth failure screen ("the binary hangs") is a product
  decision, and the existing screen is not wrong — the binary on this machine
  cannot be used.
- **The kill is not a diagnosis.** Nothing else changes: a killed call is an
  error like any other, so a hung read during a refresh tick leaves the last
  values on screen rather than blanking them (ADR 0012).

## Consequences

- The app always reaches a screen. The worst case is 5 s of the startup screen
  followed by the missing-binary screen, which the smoke suite now asserts
  against a fake binary that sleeps.
- Writes inherit the same bound. A write that times out is reported as a failure
  and the optimistic value rolls back — the honest outcome, since nothing
  confirmed the write (ADR 0009: only a parsed `actions` entry does).
- The wait is a poll (20 ms steps) rather than a blocking read with a deadline:
  `std::process` has no timed wait, and the alternative was a dependency for
  what is a dozen lines in the one module already excluded from the coverage
  gate.
- If the owner would rather see a dedicated screen for "the binary hangs", that
  is a `Detection` variant plus a screen — the seam is already there.
