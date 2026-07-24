# 0009. The headsetcontrol adapter: an injected runner, parsing as the only source of truth

## Status
Accepted (2026-07-24)

## Context

The adapter over the `headsetcontrol` CLI (issue #8) has to be gated at 100%
coverage while CI has no headset and no binary. It also has to survive what the
real binary actually does — which was recorded before writing any code, and is
not what a reasonable implementation would assume:

- **The exit code carries no information.** A write that failed on every device
  still exits 0. `Command::status().success()` is true for a total failure.
- **A write answers in a different shape from a read.** Reads produce
  `{"devices": [...]}`; writes produce `{"actions": [{capability, device,
  status, error_message}]}`, one entry per device the CLI touched.
- **`-d` wants `0x3329:0x4b28`.** The bare `3329:4b28` — which is exactly what
  the domain `Device.id` looks like — is rejected outright. Worse, on a *read* a
  `-d` that matches nothing is ignored and every connected device comes back.
- **Values carry sentinels.** `id_vendor` is the hex *string* `"0x3329"`,
  `battery.level` is `-1` for "no reading", and a device that is present but
  unreadable (no udev rule) answers `status: "partial"` with an `errors` map.

## Decision

- **The exec is injected.** `trait CliRunner { fn run(&[String]) -> Result<CliOutput, String> }`
  is the adapter's only impure dependency. Tests drive it with recorded
  fixtures; the single real `Command::new("headsetcontrol")` lives in
  `backend/exec.rs`, which the coverage gate excludes alongside the bootstrap —
  it has no logic to test that would not be testing `std::process`.
  `CliOutput` keeps **both** streams, because the CLI reports a bad argument by
  printing to stderr and leaving stdout empty.
- **Success is decided by parsing, never by the exit status.** `set_param` reads
  the `actions` array and fails on the first non-`success` entry, surfacing the
  CLI's own `error_message`. An empty `actions` array is a failure too: nothing
  confirmed the write.
- **The CLI's shape stays private.** `RawOutput`/`RawDevice`/`RawBattery`/
  `RawAction` are module-private serde structs mapped onto the domain types in
  `backend/mod.rs`. Nothing from the CLI's vocabulary crosses the IPC boundary.
- **Sentinels become absence, unknowns become "no reading".** `level: -1` and a
  non-available status map to `level: None`; a battery status this build has
  never heard of maps to `Unavailable` rather than failing the parse. A chatmix
  outside `u8` is dropped. The device is never described with an invented value.
- **`-d` is used *and* the result is re-filtered by id while parsing**, because
  an unmatched `-d` silently widens a read to every device. Belt and braces on
  purpose: reporting one headset's battery as another's would be worse than an
  error.
- **Writes are addressed by capability**, through a `CAP_* → flag` table
  (`CAP_SIDETONE` → `-s`, `CAP_NOISE_FILTER` → `--noise-filter`, …). That is
  capability knowledge, which Rust is allowed to hold; model knowledge stays in
  `src/profiles/`. A capability outside the table is an error, never a silent
  no-op — a write the user asked for must not appear to succeed.
- **The adapter is wired as the live backend now.** `UnimplementedBackend` was
  removed with it (dead the moment a real backend existed). `BackendError::NotImplemented`
  stays: it is part of the wire contract the frontend already renders, and a
  backend covering only part of the seam — the planned native HID one — will
  return it.

## Consequences

- The parser and adapter are fully covered from fixtures, with no binary
  installed. CI stays hermetic; `backend/exec.rs` is the only untested Rust and
  the smoke E2E (#14) covers it.
- Every recorded fixture is a tripwire: upgrading `headsetcontrol` and changing
  its format turns CI red instead of breaking users at runtime.
- `DeviceState` carries only what the CLI can read back — battery and chatmix.
  Sidetone, inactive time and the rest are write-only, so the frontend has to
  hold the last written value itself (#11's optimistic update, which it does
  anyway).
- A device with no udev permission is *listed* but reports no values. That is
  deliberately not an error here — turning it into the `no-permissions` screen
  is binary detection's job (#9), which now has a signal to key on.
- `CAP_EQUALIZER` / `CAP_PARAMETRIC_EQUALIZER` are not writable through this
  adapter: they take a list of band values, which `ParamValue` (int/bool)
  cannot express. The full equalizer (#16) extends `ParamValue` when it lands.
