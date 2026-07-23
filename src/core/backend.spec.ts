import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackendCallError, DEVICES_CHANGED, describeBackendError, tauriBackend } from "./backend";
import type { Device, DeviceState } from "./types.gen";

const { listen } = vi.hoisted(() => ({ listen: vi.fn() }));
const { commands } = vi.hoisted(() => ({
  commands: {
    listDevices: vi.fn(),
    deviceState: vi.fn(),
    setParam: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({ listen }));
vi.mock("./types.gen", () => ({ commands }));

const DEVICE: Device = {
  id: "3329:4b28",
  name: "Audeze Maxwell 2",
  vendor: "Audeze LLC",
  product: "Audeze Maxwell XBOX Dongle",
  vendorId: 0x3329,
  productId: 0x4b28,
  capabilities: ["CAP_SIDETONE"],
};

const STATE: DeviceState = { battery: { status: "available", level: 92 }, chatmix: 64 };

describe("tauriBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the devices the IPC command reports", async () => {
    commands.listDevices.mockResolvedValue({ status: "ok", data: [DEVICE] });

    await expect(tauriBackend.listDevices()).resolves.toEqual([DEVICE]);
  });

  it("returns the state of one device", async () => {
    commands.deviceState.mockResolvedValue({ status: "ok", data: STATE });

    await expect(tauriBackend.deviceState(DEVICE.id)).resolves.toEqual(STATE);
    expect(commands.deviceState).toHaveBeenCalledWith(DEVICE.id);
  });

  it("forwards a parameter write", async () => {
    commands.setParam.mockResolvedValue({ status: "ok", data: null });

    await expect(
      tauriBackend.setParam(DEVICE.id, "CAP_SIDETONE", { kind: "int", value: 64 }),
    ).resolves.toBeUndefined();
    expect(commands.setParam).toHaveBeenCalledWith(DEVICE.id, "CAP_SIDETONE", {
      kind: "int",
      value: 64,
    });
  });

  it("turns a reported backend error into a typed exception", async () => {
    commands.listDevices.mockResolvedValue({
      status: "error",
      error: { kind: "failed", message: "device gone" },
    });

    const failure = await tauriBackend.listDevices().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BackendCallError);
    expect((failure as BackendCallError).reason).toEqual({
      kind: "failed",
      message: "device gone",
    });
    expect((failure as BackendCallError).message).toBe("backend failure: device gone");
  });

  it("subscribes to hotplug events and hands back the unsubscribe", async () => {
    const unlisten = vi.fn();
    listen.mockResolvedValue(unlisten);
    const handler = vi.fn();

    const unsubscribe = await tauriBackend.onDevicesChanged(handler);

    expect(listen).toHaveBeenCalledWith(DEVICES_CHANGED, expect.any(Function));
    listen.mock.calls[0][1]({ event: DEVICES_CHANGED, payload: null });
    expect(handler).toHaveBeenCalledOnce();
    expect(unsubscribe).toBe(unlisten);
  });
});

describe("describeBackendError", () => {
  it("describes a backend that is not implemented yet", () => {
    expect(describeBackendError({ kind: "not_implemented" })).toBe("backend not implemented");
  });

  it("describes a device-layer failure", () => {
    expect(describeBackendError({ kind: "failed", message: "no such device" })).toBe(
      "backend failure: no such device",
    );
  });
});
