import { describe, expect, it, vi } from "vitest";

import { BackendCallError } from "./backend";
import { DEFAULT_SCENARIO, MAXWELL2_XBOX, MockBackend } from "./mock-backend";

describe("MockBackend", () => {
  it("reports the scripted devices", async () => {
    await expect(new MockBackend().listDevices()).resolves.toEqual([MAXWELL2_XBOX]);
  });

  it("takes a scenario over the default one", async () => {
    const backend = new MockBackend({ devices: [] });

    await expect(backend.listDevices()).resolves.toEqual([]);
  });

  it("leaves the default scenario untouched when a scenario mutates", async () => {
    new MockBackend().setDevices([]);

    expect(DEFAULT_SCENARIO.devices).toEqual([MAXWELL2_XBOX]);
  });

  it("reports the scripted state of a device", async () => {
    await expect(new MockBackend().deviceState(MAXWELL2_XBOX.id)).resolves.toEqual({
      battery: { status: "available", level: 92 },
      chatmix: 64,
    });
  });

  it("answers with empty state for an unknown device", async () => {
    await expect(new MockBackend().deviceState("dead:beef")).resolves.toEqual({
      battery: null,
      chatmix: null,
    });
  });

  it("records parameter writes", async () => {
    const backend = new MockBackend();

    await backend.setParam(MAXWELL2_XBOX.id, "CAP_SIDETONE", { kind: "int", value: 64 });

    expect(backend.writes).toEqual([
      { deviceId: MAXWELL2_XBOX.id, param: "CAP_SIDETONE", value: { kind: "int", value: 64 } },
    ]);
  });

  it("notifies subscribers when the device list changes", async () => {
    const backend = new MockBackend();
    const handler = vi.fn();
    await backend.onDevicesChanged(handler);

    backend.setDevices([]);

    expect(handler).toHaveBeenCalledOnce();
    await expect(backend.listDevices()).resolves.toEqual([]);
  });

  it("stops notifying after unsubscribing", async () => {
    const backend = new MockBackend();
    const handler = vi.fn();
    const unsubscribe = await backend.onDevicesChanged(handler);

    unsubscribe();
    backend.setDevices([]);

    expect(handler).not.toHaveBeenCalled();
  });

  it("fails a scripted operation with a backend error", async () => {
    const backend = new MockBackend();
    backend.fail("setParam", { kind: "error", error: { kind: "failed", message: "write denied" } });

    const failure = await backend
      .setParam(MAXWELL2_XBOX.id, "CAP_SIDETONE", { kind: "int", value: 1 })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BackendCallError);
    expect((failure as BackendCallError).message).toBe("backend failure: write denied");
    expect(backend.writes).toEqual([]);
  });

  it("clears a scripted failure", async () => {
    const backend = new MockBackend();
    backend.fail("listDevices", { kind: "error", error: { kind: "not_implemented" } });

    backend.fail("listDevices", null);

    await expect(backend.listDevices()).resolves.toEqual([MAXWELL2_XBOX]);
  });

  it("never settles a call scripted to time out", async () => {
    const backend = new MockBackend();
    backend.fail("listDevices", { kind: "timeout" });
    const settled = vi.fn();

    void backend.listDevices().then(settled, settled);
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).not.toHaveBeenCalled();
  });

  it("applies the scripted latency before answering", async () => {
    vi.useFakeTimers();
    const backend = new MockBackend({ latencyMs: 50 });
    const settled = vi.fn();

    void backend.listDevices().then(settled);
    await vi.advanceTimersByTimeAsync(49);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
