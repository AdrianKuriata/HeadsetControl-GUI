import type { HeadsetBackend, Unsubscribe } from "./backend";
import { BackendCallError } from "./backend";
import type { BackendError, Device, DeviceState, ParamValue } from "./types.gen";

/**
 * How a mocked call misbehaves: it either rejects with a backend error, or
 * never settles at all — the timeout case the UI has to survive.
 */
export type MockFailure = { kind: "error"; error: BackendError } | { kind: "timeout" };

export type MockOperation = "listDevices" | "deviceState" | "setParam";

export interface MockScenario {
  devices: Device[];
  /** Device state by device id; a missing entry answers with empty state. */
  states: Record<string, DeviceState>;
  /** Artificial latency of every call, in milliseconds. */
  latencyMs: number;
  failures: Partial<Record<MockOperation, MockFailure>>;
}

/** One connected Maxwell 2 Xbox dongle — the recorded reference device. */
export const MAXWELL2_XBOX: Device = {
  id: "3329:4b28",
  name: "Audeze Maxwell 2",
  vendor: "Audeze LLC",
  product: "Audeze Maxwell XBOX Dongle",
  vendorId: 0x3329,
  productId: 0x4b28,
  capabilities: [
    "CAP_SIDETONE",
    "CAP_BATTERY_STATUS",
    "CAP_INACTIVE_TIME",
    "CAP_CHATMIX_STATUS",
    "CAP_VOICE_PROMPTS",
    "CAP_EQUALIZER_PRESET",
    "CAP_NOISE_FILTER",
  ],
};

export const DEFAULT_SCENARIO: MockScenario = {
  devices: [MAXWELL2_XBOX],
  states: {
    [MAXWELL2_XBOX.id]: {
      battery: { status: "available", level: 92 },
      chatmix: 64,
    },
  },
  latencyMs: 0,
  failures: {},
};

const EMPTY_STATE: DeviceState = { battery: null, chatmix: null };

/**
 * A scripted {@link HeadsetBackend} with no Rust behind it: the frontend and
 * the Playwright suite (#13) develop against this. Scenarios are mutable so a
 * test can plug a device in mid-flight.
 */
export class MockBackend implements HeadsetBackend {
  readonly scenario: MockScenario;
  readonly writes: { deviceId: string; param: string; value: ParamValue }[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(scenario: Partial<MockScenario> = {}) {
    this.scenario = { ...structuredClone(DEFAULT_SCENARIO), ...scenario };
  }

  async listDevices(): Promise<Device[]> {
    await this.simulate("listDevices");
    return [...this.scenario.devices];
  }

  async deviceState(deviceId: string): Promise<DeviceState> {
    await this.simulate("deviceState");
    return this.scenario.states[deviceId] ?? EMPTY_STATE;
  }

  async setParam(deviceId: string, param: string, value: ParamValue): Promise<void> {
    await this.simulate("setParam");
    this.writes.push({ deviceId, param, value });
  }

  async onDevicesChanged(handler: () => void): Promise<Unsubscribe> {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  /** Drives a hotplug event: replaces the device list and notifies listeners. */
  setDevices(devices: Device[]): void {
    this.scenario.devices = devices;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Makes the next calls to `operation` fail, or clears the failure. */
  fail(operation: MockOperation, failure: MockFailure | null): void {
    if (failure === null) {
      delete this.scenario.failures[operation];
    } else {
      this.scenario.failures[operation] = failure;
    }
  }

  private async simulate(operation: MockOperation): Promise<void> {
    const failure = this.scenario.failures[operation];

    if (failure?.kind === "timeout") {
      // Deliberately never settles: this is what a hung backend looks like.
      await new Promise<never>(() => {});
    }

    if (this.scenario.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.scenario.latencyMs));
    }

    if (failure?.kind === "error") {
      throw new BackendCallError(failure.error);
    }
  }
}
