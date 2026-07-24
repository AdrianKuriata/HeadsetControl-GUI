# 0010. Binary detection: a version gate on the CLI's own output, permissions diagnosed at the device node

## Status
Accepted (2026-07-24)

## Context

Startup has to route to `missing-binary`, `bad-version` or `no-permissions`
(issue #9, PROJECT.md §3.3) — and each of those screens tells the user to do
something, so a wrong verdict costs them real work. Three facts shaped the
design, all measured before writing code:

- **`--output=json` already names the binary.** Its envelope carries
  `{"name": "HeadsetControl", "version": "...", "api_version": "1.4", ...}`
  alongside `devices`, so detection needs no extra invocation and no
  `--version` parsing.
- **No released `headsetcontrol` supports Audeze Maxwell 2.** Support landed
  upstream in May 2026 (Sapd/HeadsetControl#506), after the newest tag `3.1.0`
  (May 2025). Every build that works today therefore calls itself something
  like `continuous-52-gfe086cd-modified` — a string no version comparison can
  order.
- **`Could not open device` is not a permission signal.** Confirmed against the
  owner's hardware (ADR 0009): a *powered-off* headset produces exactly the
  same `status: "partial"` + `errors` map as a missing udev rule. Diagnosing
  permissions from CLI output would tell users with a switched-off headset to
  edit `/etc/udev/rules.d`.

## Decision

- **Detection is a verdict, not an error.** `HeadsetBackend::detect() ->
  Detection` (`Ready | MissingBinary | BadVersion { found, required } |
  NoPermissions`) is total; "it does not work" is the answer, not a failure to
  handle. `src/core/probe.ts` maps it onto the state machine's `ProbeFailure`s.
- **A binary that cannot be spawned is the missing one.** No filesystem search:
  `Command::new("headsetcontrol")` failing *is* the answer, so `PATH` semantics
  stay the OS's business.
- **Output this build cannot read is `BadVersion { found: None }`**, not a
  missing binary — that is what an older CLI printing usage on stderr looks
  like. `found` is nullable through to the UI, which then shows a sentence that
  names no version rather than inventing an "unknown" one.
- **Minimum version `3.2.0`, provisionally** — the release expected to carry
  Maxwell 2 support. It is a single `const` in `backend/detect.rs`; when
  upstream tags that release (tracked with the Xbox PID in issue #18 /
  Sapd/HeadsetControl#540) the constant is the one line to correct.
- **A version that cannot be compared is accepted**, with a log line. A build
  calling itself `continuous-…` is exactly the build this app needs today;
  rejecting it would lock out every working install. Releases are compared as
  `major.minor.patch`, `v` prefixes and `-rc1`/`+build` suffixes ignored.
- **Permissions are diagnosed by opening the device node, never guessed from
  CLI output.** `trait DeviceAccess { fn access(vendor_id, product_id) ->
  Granted | Denied | Unknown }` is injected exactly like `CliRunner`; the real
  implementation (`exec.rs`, excluded from coverage) matches `HID_ID` in
  `/sys/class/hidraw/*/device/uevent` and opens `/dev/hidrawN`. Opening is the
  only honest check: a udev rule grants access through an **ACL**
  (`crw-rw----+`), which permission bits do not show — reading the mode would
  report "denied" on a machine that works. Nothing is ever written and the
  handle is dropped immediately.
- **`NoPermissions` needs unanimity.** At least one listed device, and *every*
  one of them denied. `Unknown` — no matching node, a non-Linux platform, a
  busy device — never produces the screen: the app must not tell a user to fix
  something it cannot see is broken.
- **Detection runs at startup and on retry only.** Hotplug refresh
  (`refreshDevices`) re-lists devices and nothing else; a headset being plugged
  in is no reason to re-check a binary, and re-probing would double the CLI
  spawns on every event and every poll tick (#10).
- **The screens lead to a source build.** Since no package anywhere ships a new
  enough binary, `missing-binary` and `bad-version` share one component with
  per-distribution dependencies (Debian/Ubuntu, Fedora, Arch) and upstream's
  build steps. `no-permissions` shows `headsetcontrol -u | sudo tee
  /etc/udev/rules.d/70-headsets.rules`, upstream's own generator — one rule per
  supported device instead of a hand-written `hidraw*` catch-all that would
  hand every HID device on the machine to the desktop user.

## Consequences

- **`3.1.0` — the newest actual release — is rejected.** A user on a packaged
  `headsetcontrol` lands on `bad-version` even if their (non-Maxwell) headset
  would have worked. This follows PROJECT.md §6 ("we require a version with
  Maxwell 2 support") and is the price of one clear minimum; the alternative —
  letting an old binary through and failing per-capability later — trades a
  screen that says what to do for confusing runtime gaps. Revisit if upstream
  releases slip further, or when M4 bundles the binary (PROJECT.md §6).
- The whole diagnosis is unit-tested from recorded fixtures plus a fake
  `DeviceAccess`; the real hidraw path was verified once against the owner's
  machine (Maxwell 2 with a udev rule → `Granted`, a Razer node without one →
  `Denied`, an absent id → `Unknown`).
- `Detection` is a wire type: adding a verdict means a new frontend state and
  screen. That is the intended cost — every reason the app cannot work is
  something the user is told about, not something logged.
- A native HID backend implements `detect()` too, and would answer
  `NoPermissions` from the same `DeviceAccess` seam without any frontend change.
