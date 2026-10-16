# 0016. The version floor buys latency, not capability

## Status

Accepted (2026-09-11). Supersedes the version-floor part of
[0010](0010-binary-detection-and-permission-diagnosis.md); the rest of that ADR
stands.

## Context

[0010](0010-binary-detection-and-permission-diagnosis.md) set `MIN_VERSION`
because nothing older could *talk* to a Maxwell 2 at all. That argument expired
with 4.0.0, which supports the hardware. The floor now exists for a different
reason, measured on the owner's Maxwell 2 (`0x3329:0x4b28`), three runs each:

| invocation | 4.0.0 | 4.1.0 |
|---|---|---|
| `-s 20 -o json` (a parameter write, as this app makes it) | 2.90 s | 0.07 s |
| `-b -m -o json` (two info capabilities) | 2.83 s | 1.34 s |

Two upstream patches from this project account for the difference:
[#549](https://github.com/Sapd/HeadsetControl/pull/549) stops structured output
from forcing info reads on a write, and
[#550](https://github.com/Sapd/HeadsetControl/pull/550) answers every Audeze info
capability from one status read. Both shipped in 4.1.0.

Separately, [#551](https://github.com/Sapd/HeadsetControl/pull/551) changed how a
git build names itself: `4.1.0-12-gca98ed4`, not `continuous-52-gfe086cd`.

## Decision

- **`MIN_VERSION` is 4.1.0, and the reason recorded next to it is the table
  above.** A binary the app merely tolerates is not the bar; one on which a
  slider write lands in 70 ms is. 4.0.0 is rejected even though it works.
- **The floor may move for latency again.** It is a product-visible number
  (PROJECT.md §10), not only a compatibility constant, and a future release that
  halves a call cost is grounds to raise it while this app has no released users.
- **A git build is judged on the tag it grew from.** `Version::parse` already
  takes the release prefix, so `4.1.0-12-g…` passes and `4.0.0-57-g…` does not —
  correct, since the latter predates the patches the floor exists for. A version
  that still cannot be compared at all is accepted, as before.
- **Fixtures that read a real Maxwell are recorded from a build of upstream
  master, never from released 4.1.0.** 4.1.0 sends a parameter-setting packet on
  every info read that permanently shifts the headset's audio balance
  ([#561](https://github.com/Sapd/HeadsetControl/issues/561), removed after the
  tag in [#577](https://github.com/Sapd/HeadsetControl/pull/577)). Writes do not
  send it and are recorded from the release.

## Consequences

- Users on a packaged 4.0.0 land on `bad-version`. Acceptable while nothing is
  released; at the first release of this app, raising the floor stops being free
  and this ADR needs revisiting.
- The recorded fixtures carry two different version strings on purpose — a
  release for writes, a git description for reads — and
  `docs/architecture/testing.md` says which and why. A single
  `RECORDED_VERSION` const in the adapter tests names the latter, so re-recording
  cannot leave a stale literal behind.
- Write coalescing ([0015](0015-coalesce-writes-per-capability.md)) and the 10 s
  `CALL_TIMEOUT` stay exactly as they are. Neither was a latency workaround: one
  bounds an event rate, the other bounds a hang.
