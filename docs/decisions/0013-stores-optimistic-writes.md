# 0013. Stores: injected backend, a focused device, optimistic writes with a guarded rollback

## Status
Accepted (2026-07-24)

## Context

`devices.ts` and `device.ts` (issue #11) are a 100%-coverage layer that has to
be testable with no Tauri, no binary and no headset, and they carry the one
piece of behaviour a user notices when things go wrong: a parameter write that
the device refuses (PROJECT.md §3.3 — roll back the optimistic update and toast).

Four forces shaped the design:

- **Reading back is the exception.** Only battery and chatmix can be read from
  the CLI; every other capability is write-only (ADR 0009), so the store *is*
  the record of what was set, not a cache of what the device says.
- **A store has no lifecycle.** A Pinia singleton has no `onUnmounted`, so it
  cannot own the hotplug subscription or the refresh loop — App.vue does, and it
  feeds the stores.
- **Two answers can race.** A slider produces writes faster than the CLI
  answers, and a reply can arrive after the user switched headsets. Neither may
  overwrite what is on screen now.
- **The values on screen belong to a device.** Which one is not obvious from a
  bare `params` map, and asking the caller to pass a device id into every action
  makes every caller responsible for that correctness.

## Decision

- **The backend is an argument, never a singleton the store reaches for.**
  `refresh(backend)` and `write(backend, capability, value)` take the
  `HeadsetBackend`. The stores depend on the interface only (DIP), and every
  test drives them with `MockBackend`.
- **`device.ts` knows which headset it describes.** `focus(id)` points it at one
  and clears everything when the id changes; App.vue calls it from a `watch` on
  the state machine's `ready` device. A reply that arrives for a device the
  store no longer holds is dropped, not shown against the wrong headset.
- **Writes are optimistic and the rollback is guarded by a ticket.** Each write
  takes a monotonic ticket and records it as the newest for that capability; a
  failure only restores the previous value when its ticket is still the newest.
  A slow refusal therefore reports without clobbering a newer value. The guard
  deliberately does not compare the stored value: reading it back yields a
  reactive proxy of the object that was written, so identity comparison would
  silently never match, and two writes can carry equal values anyway.
- **The toast is store state, not a side effect.** `failure: { capability,
  reason } | null` plus `dismiss()`. App.vue renders `controls/HToast.vue` from
  it — a control, so it carries no copy of its own; the message and the button
  label arrive translated from the caller.
- **`devices.ts` keeps the selection as an id.** The selected device resolves
  lazily (the id if it is connected, else the first device), so a headset that
  is unplugged and plugged back in is still the selected one. `hasChoice` is
  what a picker will render; moving the *screen* to a newly picked device needs
  an event the state machine does not have yet, and lands with the picker UI
  rather than being invented ahead of it.

## Consequences

- Both stores are pure logic over an injected interface: no mocking of Tauri, no
  test-only globals, 100% lines/branches/functions without effort.
- App.vue keeps the subscriptions and the refresh loop, and gains two lines to
  feed the stores. The state machine is untouched: it still decides *which
  screen*, the stores hold *what is on it*.
- Feature components (#12) write through `device.write(...)` and read
  `device.params[capability]`, with no knowledge of rollback or toasts.
- Until the picker exists, `devices.select()` changes the store's selection
  without moving the screen. That is deliberate: the state machine gains a
  `device-selected` event when there is a control to emit it.
