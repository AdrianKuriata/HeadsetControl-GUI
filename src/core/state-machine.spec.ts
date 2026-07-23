import { describe, expect, it } from "vitest";

import { INITIAL_STATE, isRetryable, transition } from "./state-machine";
import type { AppState } from "./state-machine";
import type { Device } from "./types.gen";

const MAXWELL: Device = {
  id: "3329:4b28",
  name: "Audeze Maxwell 2",
  vendor: "Audeze LLC",
  product: "Audeze Maxwell XBOX Dongle",
  vendorId: 0x3329,
  productId: 0x4b28,
  capabilities: ["CAP_SIDETONE"],
};

const OTHER: Device = { ...MAXWELL, id: "1038:12ad", name: "Some Other Headset" };

const READY: AppState = { kind: "ready", device: MAXWELL };
const LOST: AppState = { kind: "device-lost", device: MAXWELL };

describe("the app starts by checking the binary", () => {
  it("begins in checking-binary", () => {
    expect(INITIAL_STATE).toEqual({ kind: "checking-binary" });
  });

  it("goes to ready with the connected device", () => {
    expect(transition(INITIAL_STATE, { kind: "probe-succeeded", devices: [MAXWELL] })).toEqual(
      READY,
    );
  });

  it("goes to no-device when the binary works but nothing is connected", () => {
    expect(transition(INITIAL_STATE, { kind: "probe-succeeded", devices: [] })).toEqual({
      kind: "no-device",
    });
  });

  it.each([
    { failure: { kind: "missing-binary" } as const },
    { failure: { kind: "bad-version", found: "2.5.0", required: "3.0.0" } as const },
    { failure: { kind: "no-permissions" } as const },
  ])("goes to $failure.kind when the probe fails that way", ({ failure }) => {
    expect(transition(INITIAL_STATE, { kind: "probe-failed", failure })).toEqual(failure);
  });

  it("ignores a probe result that arrives after the app moved on", () => {
    expect(transition(READY, { kind: "probe-succeeded", devices: [] })).toBe(READY);
    expect(transition(READY, { kind: "probe-failed", failure: { kind: "missing-binary" } })).toBe(
      READY,
    );
  });

  it("ignores hotplug until the probe has finished", () => {
    expect(transition(INITIAL_STATE, { kind: "devices-changed", devices: [MAXWELL] })).toBe(
      INITIAL_STATE,
    );
  });
});

describe("retrying the probe", () => {
  it.each([
    { state: { kind: "missing-binary" } as AppState },
    { state: { kind: "bad-version", found: "2.5.0", required: "3.0.0" } as AppState },
    { state: { kind: "no-permissions" } as AppState },
  ])("re-runs the probe from $state.kind", ({ state }) => {
    expect(isRetryable(state)).toBe(true);
    expect(transition(state, { kind: "retry" })).toEqual({ kind: "checking-binary" });
  });

  it.each([
    { state: INITIAL_STATE },
    { state: { kind: "no-device" } as AppState },
    { state: READY },
    { state: LOST },
  ])("offers no retry in $state.kind", ({ state }) => {
    expect(isRetryable(state)).toBe(false);
    expect(transition(state, { kind: "retry" })).toBe(state);
  });
});

describe("hotplug", () => {
  it("connects a device from no-device", () => {
    expect(
      transition({ kind: "no-device" }, { kind: "devices-changed", devices: [MAXWELL] }),
    ).toEqual(READY);
  });

  it("stays in no-device when nothing is connected", () => {
    expect(transition({ kind: "no-device" }, { kind: "devices-changed", devices: [] })).toEqual({
      kind: "no-device",
    });
  });

  it("refreshes the device in ready when its values change", () => {
    const refreshed = { ...MAXWELL, capabilities: ["CAP_SIDETONE", "CAP_BATTERY_STATUS"] };

    expect(transition(READY, { kind: "devices-changed", devices: [refreshed] })).toEqual({
      kind: "ready",
      device: refreshed,
    });
  });

  it("loses the device when it disappears", () => {
    expect(transition(READY, { kind: "devices-changed", devices: [] })).toEqual(LOST);
  });

  it("keeps the lost device on screen while another one is connected", () => {
    expect(transition(READY, { kind: "devices-changed", devices: [OTHER] })).toEqual(LOST);
  });

  it("returns to ready when the device comes back", () => {
    expect(transition(LOST, { kind: "devices-changed", devices: [MAXWELL] })).toEqual(READY);
  });

  it("falls back to no-device when a different headset replaces the lost one", () => {
    expect(transition(LOST, { kind: "devices-changed", devices: [OTHER] })).toEqual({
      kind: "no-device",
    });
  });

  it("falls back to no-device when nothing comes back", () => {
    expect(transition(LOST, { kind: "devices-changed", devices: [] })).toEqual({
      kind: "no-device",
    });
  });
});
