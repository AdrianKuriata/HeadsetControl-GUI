# 0011. Hotplug: a pure loop, OS watchers behind a seam, no vendor table

## Status
Accepted (2026-07-24)

## Context

Hotplug (issue #10) has to make plugging a headset in update the UI by itself,
on a machine CI does not have: no headset, no udev daemon worth trusting, and no
way to move hardware from a test. Three forces pulled against each other:

- **PROJECT.md §3.1 puts the udev monitor in `backend/hotplug.rs`**, while the
  coverage gate demands 100% lines/functions/regions from every backend module
  except the excluded impure edges. Code that talks to libudev cannot be
  unit-tested, so it cannot live in a gated file.
- **§3.1 also says the monitor should be "filtered by known vendor VIDs".** That
  means a table of headset vendors in Rust — exactly the model knowledge the
  same section forbids Rust to have, and a list that goes stale every time
  upstream supports a new brand.
- **udev is Linux.** An unconditional dependency would break the Windows and
  macOS builds §7 exists to keep cheap, and the `udev` crate links against
  libudev, adding a system build dependency.
- **Values are not events.** Nothing tells the app the battery dropped a
  percent, so §3.1 asks for a ~5 s refresh while the window is active — a second
  mechanism that must not become a second hotplug path.

## Decision

- **The loop is pure and lives in `backend/hotplug.rs`; the watchers do not.**
  `trait DeviceWatcher { fn wait_for_change(&mut self) -> bool }` is the seam,
  next to `trait ChangeSink`. `UdevWatcher` and `PollingWatcher` implement it in
  `backend/exec.rs` — already the module for the process spawn and the hidraw
  look (ADR 0009), already excluded from the coverage gate. `hotplug::watch`,
  `hotplug::choose` and the change detection are tested with fakes at 100%.
  This is a deliberate refinement of PROJECT.md §3.1's file layout, not of its
  intent: OS-specific code stays in one designated module.
- **A change is what the adapter lists, not what the kernel said.** Every signal
  makes the loop re-list devices and compare their ids with the previous set;
  `devices-changed` is emitted only when the set differs. So the udev monitor
  filters on the `hidraw` subsystem — one filter, no vendor table — and a burst
  of events, or a polling tick, costs the frontend nothing.
- **Polling is the fallback and the default elsewhere.** `hotplug::choose` takes
  the native watcher and the polling one; the fallback is used when there is no
  native watcher (any platform but Linux, or a monitor that would not open) and
  when `HEADSET_DECK_WATCHER=polling` forces it. `POLL_INTERVAL` is 3 s: each
  tick is one `headsetcontrol` invocation.
- **The `udev` crate is target-gated** to `cfg(target_os = "linux")` with the
  `send` feature, so the monitor can live on the hotplug thread and the crate
  still builds untouched off Linux. `libudev-dev` joins the Linux build
  prerequisites (README, CI setup action).
- **Live values are polled separately, in the frontend.** `core/refresh.ts`
  ticks every `REFRESH_INTERVAL_MS` (5 s) while `document.visibilityState` is
  not `hidden`, pausing when the window is away. Visibility rather than focus: a
  window behind another one is still being looked at.

## Consequences

- The whole hotplug decision surface — when an event fires, which watcher runs —
  is unit-tested with no hardware. What is not tested anywhere is the delivery of
  a real udev event: triggering one needs root (`udevadm trigger` fails as a
  user, `/dev/uhid` is root-only), so a physical plug/unplug stays a
  hardware-in-the-loop check for the repository owner, and the smoke E2E (#14)
  can only cover the polling path.
- A Windows or macOS watcher is a `DeviceWatcher` impl in `exec.rs` plus one arm
  in `native_watcher()`; nothing else moves.
- The app spawns `headsetcontrol` every 3 s on machines without udev, and every
  5 s per visible device for values. Both intervals are single constants.
- The loop never re-runs detection (#9): a plugged headset is no reason to
  re-check the binary's version or its permissions.
