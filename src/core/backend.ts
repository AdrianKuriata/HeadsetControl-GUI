import { listen } from "@tauri-apps/api/event";

import { commands } from "./types.gen";
import type { BackendError, Device, DeviceState, ParamValue } from "./types.gen";

/// The event the Rust hotplug watcher emits when the device list changes.
export const DEVICES_CHANGED = "devices-changed";

/** Removes a subscription made with {@link HeadsetBackend.onDevicesChanged}. */
export type Unsubscribe = () => void;

/**
 * Everything the app is allowed to ask of a headset source.
 *
 * This module is the **only** place in `src/` that talks to Tauri: stores and
 * components depend on this interface, which is what lets the whole UI run
 * against {@link MockBackend} with no Rust behind it.
 */
export interface HeadsetBackend {
  listDevices(): Promise<Device[]>;
  deviceState(deviceId: string): Promise<DeviceState>;
  setParam(deviceId: string, param: string, value: ParamValue): Promise<void>;
  /** Calls `handler` whenever devices are plugged in or removed. */
  onDevicesChanged(handler: () => void): Promise<Unsubscribe>;
}

/** A failed backend call, carrying the typed error the backend reported. */
export class BackendCallError extends Error {
  constructor(readonly reason: BackendError) {
    super(describeBackendError(reason));
    this.name = "BackendCallError";
  }
}

export function describeBackendError(error: BackendError): string {
  return error.kind === "not_implemented"
    ? "backend not implemented"
    : `backend failure: ${error.message}`;
}

/** Unwraps tauri-specta's result envelope into a value or a thrown error. */
function unwrap<T>(
  result: { status: "ok"; data: T } | { status: "error"; error: BackendError },
): T {
  if (result.status === "error") {
    throw new BackendCallError(result.error);
  }
  return result.data;
}

/** The real backend: IPC to the Rust commands generated into `types.gen.ts`. */
export const tauriBackend: HeadsetBackend = {
  async listDevices() {
    return unwrap(await commands.listDevices());
  },

  async deviceState(deviceId) {
    return unwrap(await commands.deviceState(deviceId));
  },

  async setParam(deviceId, param, value) {
    unwrap(await commands.setParam(deviceId, param, value));
  },

  async onDevicesChanged(handler) {
    return await listen(DEVICES_CHANGED, () => handler());
  },
};
