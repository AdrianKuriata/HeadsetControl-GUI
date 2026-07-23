import type { Device } from "./types.gen";

/**
 * The app is an explicit state machine and every state owns a full screen
 * (PROJECT.md §3.3) — no screen ever renders partial state.
 */
export type AppState =
  | { kind: "checking-binary" }
  | { kind: "missing-binary" }
  | { kind: "bad-version"; found: string; required: string }
  | { kind: "no-permissions" }
  | { kind: "no-device" }
  | { kind: "ready"; device: Device }
  | { kind: "device-lost"; device: Device };

/** Why the startup probe could not reach a usable `headsetcontrol`. */
export type ProbeFailure =
  | { kind: "missing-binary" }
  | { kind: "bad-version"; found: string; required: string }
  | { kind: "no-permissions" };

export type AppEvent =
  | { kind: "probe-succeeded"; devices: Device[] }
  | { kind: "probe-failed"; failure: ProbeFailure }
  | { kind: "devices-changed"; devices: Device[] }
  | { kind: "retry" };

export const INITIAL_STATE: AppState = { kind: "checking-binary" };

/** States whose screen offers a retry that re-runs the probe. */
const RETRYABLE: readonly AppState["kind"][] = ["missing-binary", "bad-version", "no-permissions"];

export function isRetryable(state: AppState): boolean {
  return RETRYABLE.includes(state.kind);
}

function fromDevices(devices: Device[]): AppState {
  const [device] = devices;
  return device ? { kind: "ready", device } : { kind: "no-device" };
}

/**
 * The whole machine: pure, total, and the only place transitions are decided.
 * An event that means nothing in the current state leaves it untouched.
 */
export function transition(state: AppState, event: AppEvent): AppState {
  switch (event.kind) {
    case "probe-succeeded":
      return state.kind === "checking-binary" ? fromDevices(event.devices) : state;

    case "probe-failed":
      return state.kind === "checking-binary" ? { ...event.failure } : state;

    case "retry":
      return isRetryable(state) ? { kind: "checking-binary" } : state;

    case "devices-changed":
      return onDevicesChanged(state, event.devices);
  }
}

function onDevicesChanged(state: AppState, devices: Device[]): AppState {
  switch (state.kind) {
    // The connected device may have gone, or come back with fresh values.
    case "ready":
    case "device-lost": {
      const same = devices.find((device) => device.id === state.device.id);
      if (same) {
        return { kind: "ready", device: same };
      }
      // A different headset while ours is lost is `no-device` by design
      // (PROJECT.md §3.3); choosing between several devices is the devices
      // store's job (#11).
      return state.kind === "ready"
        ? { kind: "device-lost", device: state.device }
        : { kind: "no-device" };
    }

    case "no-device":
      return fromDevices(devices);

    // Nothing is known about devices until the probe finishes.
    default:
      return state;
  }
}
