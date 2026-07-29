# 0015. Coalesce writes per capability instead of queueing them

## Status
Accepted (2026-07-29)

## Context

[ADR 0013](0013-stores-optimistic-writes.md) made writes optimistic: the value
applies on screen at once and a refusal rolls it back. It said nothing about how
many calls a gesture may cost, because nothing had measured one.

On real hardware, one does. Measured against the reference headset (Audeze
Maxwell 2, `0x3329:0x4b28`, `headsetcontrol` 4.0.0):

```
headsetcontrol -d 0x3329:0x4b28 -s 20 --output=json   → 2.89 s / 2.90 s / 2.89 s
headsetcontrol --output json                          → 2.82 s
```

That is the device's protocol, not our overhead — upstream sends a 15-packet
initialisation sequence at 60 ms intervals plus six status requests on every
invocation. Other headsets answer in milliseconds; this one does not, and the app
may not assume either.

Meanwhile `HSlider` wraps a native `<input type="range">` and emits on `input`,
which fires continuously while dragging — by design, because the mock updates its
readout live and the platform gives keyboard support for free. `ProcessRunner`
then serialises every call behind a mutex, also by design: two invocations on one
hidraw node produce a stream of `Could not open device`.

Together, a single drag queued tens of writes at ~2.9 s each. The device replayed
every intermediate position of the drag **minutes** after the user let go, with
the refresh loop and the hotplug listing stuck behind it. It read as an app where
nothing works (#52).

The fix does not belong in `HSlider`. Making it write on `change` instead of
`input` would leave a held-down arrow key, and every future chatty control, with
the same problem — and would trade the live readout away for it.

## Decision

We will keep **at most one call in flight per capability, and at most one value
waiting behind it.** A write that arrives while its capability is busy *replaces*
whatever was queued rather than joining a queue; when the call in flight
finishes, the waiting value is sent.

The optimistic update is untouched — it still applies on every write, so the
readout follows the finger. Only what reaches the device is thinned out.

Coalescing is per capability: a sidetone drag never delays a noise-filter click.
Focusing another headset drops what was queued, since it was meant for the one
the user left.

`write()` resolves once the device has been told, **including any value that
replaced this one** — the replacing write returns immediately and has no call of
its own to await, so the in-flight one owns the drain.

## Consequences

- A drag costs two calls instead of one per pixel. Measured end to end on the
  real app and the real headset: **40 UI events → 2 invocations** (`-s 20`, then
  `-s 98`), with the final value the one the device receives.
- **A write may never reach the device.** That is the point, but it means
  `backend.setParam` is no longer a faithful log of what the user did — only of
  what the device was told. The smoke suite asserts on the *last* call for a
  capability, never on a count.
- The first value of a gesture still goes out immediately, so a drag momentarily
  sets an arbitrary intermediate value. Debouncing the first call would avoid it
  at the cost of a timer in a layer that has none; not worth it until something
  demonstrates it matters.
- Rollback keeps the ticket rule from ADR 0013 unchanged: a refusal of a write
  that something newer has superseded reports without rolling back — which is now
  the *common* case rather than a race.
- Nothing about this is device-specific. A headset that answers in milliseconds
  simply never has a second value waiting.
