import { describe, expect, it } from "vitest";

import { BackendCallError } from "./backend";
import { MAXWELL2_XBOX, MockBackend } from "./mock-backend";
import { probe, readDeviceState, refreshDevices } from "./probe";

describe("probe", () => {
  it("reports the connected devices once detection passes", async () => {
    await expect(probe(new MockBackend())).resolves.toEqual({
      kind: "probe-succeeded",
      devices: [MAXWELL2_XBOX],
    });
  });

  it("reports a binary that is not installed", async () => {
    const backend = new MockBackend({ detection: { kind: "missing_binary" } });

    await expect(probe(backend)).resolves.toEqual({
      kind: "probe-failed",
      failure: { kind: "missing-binary" },
    });
  });

  it("reports a binary that is too old, with both versions", async () => {
    const backend = new MockBackend({
      detection: { kind: "bad_version", found: "3.1.0", required: "4.1.0" },
    });

    await expect(probe(backend)).resolves.toEqual({
      kind: "probe-failed",
      failure: { kind: "bad-version", found: "3.1.0", required: "4.1.0" },
    });
  });

  it("reports an incompatible binary whose version is unknown", async () => {
    const backend = new MockBackend({
      detection: { kind: "bad_version", found: null, required: "4.1.0" },
    });

    await expect(probe(backend)).resolves.toEqual({
      kind: "probe-failed",
      failure: { kind: "bad-version", found: null, required: "4.1.0" },
    });
  });

  it("reports a device the app is not allowed to open", async () => {
    const backend = new MockBackend({ detection: { kind: "no_permissions" } });

    await expect(probe(backend)).resolves.toEqual({
      kind: "probe-failed",
      failure: { kind: "no-permissions" },
    });
  });

  it("does not list devices when detection already failed", async () => {
    const backend = new MockBackend({ detection: { kind: "missing_binary" } });
    backend.listDevices = () => Promise.reject(new Error("must not be called"));

    await expect(probe(backend)).resolves.toEqual({
      kind: "probe-failed",
      failure: { kind: "missing-binary" },
    });
  });

  it("reports a binary that disappears between detection and the listing", async () => {
    const backend = new MockBackend();
    backend.fail("listDevices", { kind: "error", error: { kind: "failed", message: "gone" } });

    await expect(probe(backend)).resolves.toEqual({
      kind: "probe-failed",
      failure: { kind: "missing-binary" },
    });
  });

  it("lets an unexpected error through instead of disguising it as a probe failure", async () => {
    const backend = new MockBackend();
    backend.listDevices = () => Promise.reject(new TypeError("boom"));

    await expect(probe(backend)).rejects.toThrow(TypeError);
  });

  it("only swallows backend errors", () => {
    expect(new BackendCallError({ kind: "not_implemented" })).toBeInstanceOf(Error);
  });
});

describe("refreshDevices", () => {
  it("reports the new device list as a hotplug event", async () => {
    await expect(refreshDevices(new MockBackend())).resolves.toEqual({
      kind: "devices-changed",
      devices: [MAXWELL2_XBOX],
    });
  });

  it("does not re-detect the binary — a plugged device is no reason to", async () => {
    const backend = new MockBackend();
    backend.detect = () => Promise.reject(new Error("must not be called"));

    await expect(refreshDevices(backend)).resolves.toEqual({
      kind: "devices-changed",
      devices: [MAXWELL2_XBOX],
    });
  });

  it("reports nothing when the device list cannot be read", async () => {
    const backend = new MockBackend();
    backend.fail("listDevices", { kind: "error", error: { kind: "not_implemented" } });

    await expect(refreshDevices(backend)).resolves.toBeUndefined();
  });

  it("lets an unexpected error through", async () => {
    const backend = new MockBackend();
    backend.listDevices = () => Promise.reject(new TypeError("boom"));

    await expect(refreshDevices(backend)).rejects.toThrow(TypeError);
  });
});

describe("readDeviceState", () => {
  it("reads the live values of a device", async () => {
    await expect(readDeviceState(new MockBackend(), MAXWELL2_XBOX.id)).resolves.toEqual({
      battery: { status: "available", level: 92 },
      chatmix: 64,
    });
  });

  it("reads nothing when the device does not answer", async () => {
    const backend = new MockBackend();
    backend.fail("deviceState", {
      kind: "error",
      error: { kind: "failed", message: "Could not open device" },
    });

    await expect(readDeviceState(backend, MAXWELL2_XBOX.id)).resolves.toBeUndefined();
  });

  it("lets an unexpected error through", async () => {
    const backend = new MockBackend();
    backend.deviceState = () => Promise.reject(new TypeError("boom"));

    await expect(readDeviceState(backend, MAXWELL2_XBOX.id)).rejects.toThrow(TypeError);
  });
});
