# 0017. Refuse a headsetcontrol that damages the headset, before it reads anything

## Status

Accepted (2026-10-16). Supersedes the floor in
[0016](0016-version-floor-is-a-latency-floor.md) and the "uncomparable builds are
accepted" rule of [0010](0010-binary-detection-and-permission-diagnosis.md); the
rest of both stands.

## Context

`headsetcontrol` 4.0.0 and 4.1.0 send `06 09 80 05 5A 05 00 00 09 25 00 7A` as
part of every Audeze Maxwell status read. It writes a DSP parameter. On the
original Maxwell it shifts the audio balance permanently, and only a factory reset
in Audeze HQ (Windows) undoes it
([Sapd/HeadsetControl#561](https://github.com/Sapd/HeadsetControl/issues/561));
the Maxwell 2 driver carries the same sequence. It arrived with Maxwell 2 support
(#506, so 3.1.0 is clean) and was removed in
[#577](https://github.com/Sapd/HeadsetControl/pull/577), on master after the 4.1.0
tag. No release carries the fix yet.

On 4.1.0, any `--output=json` call without an action reads every info capability
of every attached device. That covers all of this app's reads: `detect` at
startup and on retry, `list_devices` from the probe, from frontend hotplug, and
from the Rust hotplug loop (every 3 s under the polling watcher, window hidden or
not), and `device_state` every 5 s. ADR 0016 only kept *fixture recording* off the
release.

`headsetcontrol --version` returns after HID enumeration, before any request is
processed, so it never reaches a device.

## Decision

- **`MIN_VERSION` is 4.1.1.** A git build is accepted from `4.1.0-8-g…` on, since
  #577 is the 8th commit after the tag on a linear master
  (`FIRST_SAFE_GIT_BUILD`). A build whose version cannot be compared
  (`continuous-…`) is refused: nothing says whether it sends the packet, and
  `continuous-52`, the build this app was developed against, does.
- **Detection asks `--version` first** and only makes the JSON call once the
  version passes. A refused binary gets `bad-version` after one call that never
  touched the headset.
- **The adapter holds the interlock.** `HeadsetControlBackend` refuses
  `list_devices`, `device_state` and `set_param` until a detection has vetted the
  binary, and every detection resets it. That covers the Rust hotplug loop, which
  lists devices without going through the frontend. Writes are gated too: on
  4.0.0 a JSON write still forced info reads.
- **The block covers every headset, not only the Maxwell.** A Maxwell-only gate
  would need a non-JSON device listing for old binaries, since the JSON listing
  is itself the read that does the damage. That is a lot of code for a bug the
  next release removes.

## Consequences

- Until 4.1.1 ships, every packaged binary lands on `bad-version`, including the
  owner's. The screen gives the reason and points to the source build.
  `make dev-upstream` builds master, which passes the gate.
- When 4.1.1 is released, drop `FIRST_SAFE_GIT_BUILD` and its tests and record a
  fixture from the release. The install screens' repository-first order then
  leads to an accepted binary again.
- The git-build rule trusts the commit count. A fork branch with 8 or more
  commits on top of 4.1.0 that does not contain #577 would pass. Only someone who
  builds such a fork is exposed, and only until 4.1.1.
- A detection costs one extra process (`--version`, milliseconds). Nothing else
  changes cost.
