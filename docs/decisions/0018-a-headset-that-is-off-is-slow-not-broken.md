# 0018. Adopt 4.2.0, and treat a headset that is off as slow, not broken

## Status

Accepted (2026-11-01). Moves the floor of
[0017](0017-refuse-binaries-that-damage-the-headset.md) from 4.1.1 to 4.2.0 and
drops its git-build exception; `--version` first and the adapter interlock stand.
Raises the `CALL_TIMEOUT` of
[0012](0012-hardening-the-cli-boundary-and-the-supply-chain.md) from 10 s to 15 s.

## Context

No 4.1.1 shipped. 4.2.0 (2026-10-20) carries #577 and replaces the Maxwell driver
with the real protocol (#591). Capturing every byte the packaged binary sends
through a fake hidapi shows no write on any read path; the same capture on 4.1.0
shows the balance packet. On a real Maxwell 2 a read got faster:

| invocation | 4.1.0, headset on | 4.2.0, headset on | 4.2.0, headset off |
|---|---|---|---|
| `-b -m -o json` | 1.34 s | 0.45 s | 11.44 s |
| `-o json` | | 0.45 s | 11.45 s |

The new driver retries each read three times at 1.25 s, and a JSON call reads three
info capabilities. With the headset off and the dongle in, that outlasted the 10 s
call timeout: the app killed the listing and reported a working binary as missing.
On the ready screen a 5 s tick against a call this long would stack reads behind the
runner's mutex and hold up writes.

## Decision

- **`MIN_VERSION` is 4.2.0**, and `FIRST_SAFE_GIT_BUILD` and `make dev-upstream` go.
  A git build is judged on its tag, so one on top of 4.1.0 is refused even if it
  carries #577. An uncomparable build is still refused.
- **`CALL_TIMEOUT` is 15 s.** It has to clear the measured worst case; the bound still
  ends a wedged binary. A shorter fix is not ours to make: a JSON listing reads status
  whatever the app asks, and only upstream can stop retrying a headset that is off.
- **A refresh tick is skipped while a read of the same headset is out.** Keyed by
  headset, so a swap does not wait for the old read.

## Consequences

- With the headset off, startup sits on the checking screen for about 23 s (detection
  plus the device list, each 11.45 s), then shows the device with no readings.
- A truly wedged binary now takes 15 s to reach the missing-binary screen.
- A future release that adds info capabilities adds 3.75 s per capability with the
  headset off. Re-measure before adopting it.
