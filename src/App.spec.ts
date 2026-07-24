import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";

import App from "./App.vue";
import { MOCK_BACKEND_FLAG, createBackend, resetBackend } from "./core/create-backend";
import type { MockBackend } from "./core/mock-backend";
import { MAXWELL2_XBOX } from "./core/mock-backend";
import { REFRESH_INTERVAL_MS } from "./core/refresh";
import { useDeviceStore } from "./core/stores/device";
import { useDevicesStore } from "./core/stores/devices";
import { mountWithI18n } from "./test-support";

/** The backend the app will pick up, scripted before it boots. */
function scriptedBackend(): MockBackend {
  vi.stubEnv("VITE_BACKEND", MOCK_BACKEND_FLAG);
  return createBackend() as MockBackend;
}

function mountApp() {
  return mountWithI18n(App).wrapper;
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    resetBackend();
  });

  it("shows the startup probe before anything is known", () => {
    scriptedBackend();

    expect(mountApp().text()).toContain("Checking headsetcontrol");
  });

  it("shows the connected device once the probe finishes", async () => {
    scriptedBackend();

    const app = mountApp();
    await flushPromises();

    expect(app.text()).toContain(MAXWELL2_XBOX.name);
  });

  it("shows the no-device screen when the probe finds nothing", async () => {
    const backend = scriptedBackend();
    backend.setDevices([]);

    const app = mountApp();
    await flushPromises();

    expect(app.text()).toContain("No headset connected");
  });

  it("dims the device when it is unplugged", async () => {
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    backend.setDevices([]);
    await flushPromises();

    expect(app.text()).toContain("Connection lost");
  });

  it("returns to the device by itself when it comes back", async () => {
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    backend.setDevices([]);
    await flushPromises();
    backend.setDevices([MAXWELL2_XBOX]);
    await flushPromises();

    expect(app.text()).not.toContain("Connection lost");
    expect(app.text()).toContain(MAXWELL2_XBOX.name);
  });

  it("offers a retry when the probe fails, and recovers on it", async () => {
    const backend = scriptedBackend();
    backend.fail("listDevices", { kind: "error", error: { kind: "not_implemented" } });

    const app = mountApp();
    await flushPromises();
    expect(app.text()).toContain("headsetcontrol not found");

    backend.fail("listDevices", null);
    await app.get("button").trigger("click");
    await flushPromises();

    expect(app.text()).toContain(MAXWELL2_XBOX.name);
  });

  // The three detection verdicts, each landing on its own screen (#9).
  it.each([
    { detection: { kind: "missing_binary" }, shows: "headsetcontrol not found" },
    {
      detection: { kind: "bad_version", found: "3.1.0", required: "3.2.0" },
      shows: "headsetcontrol is too old",
    },
    { detection: { kind: "no_permissions" }, shows: "No permission to reach the headset" },
  ] as const)(
    "shows the $detection.kind screen when detection says so",
    async ({ detection, shows }) => {
      const backend = scriptedBackend();
      backend.scenario.detection = detection;

      const app = mountApp();
      await flushPromises();

      expect(app.text()).toContain(shows);
    },
  );

  it("recovers from a detection failure once the binary is installed", async () => {
    const backend = scriptedBackend();
    backend.scenario.detection = { kind: "missing_binary" };

    const app = mountApp();
    await flushPromises();
    expect(app.text()).toContain("headsetcontrol not found");

    backend.scenario.detection = { kind: "ready" };
    await app.get("button").trigger("click");
    await flushPromises();

    expect(app.text()).toContain(MAXWELL2_XBOX.name);
  });

  it("keeps the current screen when a hotplug refresh fails", async () => {
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    backend.fail("listDevices", { kind: "error", error: { kind: "failed", message: "gone" } });
    backend.setDevices([]);
    await flushPromises();

    expect(app.text()).toContain(MAXWELL2_XBOX.name);
  });

  it("shows the live values of the connected device", async () => {
    scriptedBackend();

    const app = mountApp();
    await flushPromises();

    expect(app.get('[data-part="battery"]').text()).toBe("92%");
  });

  it("keeps the values fresh while the app is on screen", async () => {
    vi.useFakeTimers();
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    backend.scenario.states[MAXWELL2_XBOX.id] = {
      battery: { status: "available", level: 41 },
      chatmix: null,
    };
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS);
    await flushPromises();

    expect(app.get('[data-part="battery"]').text()).toBe("41%");
  });

  it("forgets the values when the device goes away", async () => {
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    backend.setDevices([]);
    await flushPromises();

    expect(app.text()).not.toContain("92%");
  });

  it("keeps the last values when a refresh fails", async () => {
    vi.useFakeTimers();
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    backend.fail("deviceState", { kind: "error", error: { kind: "failed", message: "asleep" } });
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS);
    await flushPromises();

    expect(app.get('[data-part="battery"]').text()).toBe("92%");
  });

  it("reads nothing while there is no device to read", async () => {
    vi.useFakeTimers();
    const backend = scriptedBackend();
    backend.setDevices([]);
    const app = mountApp();
    await flushPromises();

    const reads = vi.spyOn(backend, "deviceState");
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 2);
    await flushPromises();
    app.unmount();

    expect(reads).not.toHaveBeenCalled();
  });

  it("stops refreshing once unmounted", async () => {
    vi.useFakeTimers();
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    const reads = vi.spyOn(backend, "deviceState");
    app.unmount();
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3);
    await flushPromises();

    expect(reads).not.toHaveBeenCalled();
  });

  it("keeps the devices store in step with what is connected", async () => {
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    expect(useDevicesStore().selected).toEqual(MAXWELL2_XBOX);

    backend.setDevices([]);
    await flushPromises();
    expect(useDevicesStore().selected).toBeUndefined();

    app.unmount();
  });

  it("reports a refused write in a toast, with the value already rolled back", async () => {
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    const device = useDeviceStore();
    backend.fail("setParam", { kind: "error", error: { kind: "failed", message: "asleep" } });
    await device.write(backend, "CAP_SIDETONE", { kind: "int", value: 96 });
    await flushPromises();

    expect(app.get('[data-part="toast"]').text()).toContain("CAP_SIDETONE");
    expect(device.params).toEqual({});

    await app.get('[data-part="dismiss"]').trigger("click");
    expect(app.find('[data-part="toast"]').exists()).toBe(false);
  });

  it("shows no toast while writes are going through", async () => {
    scriptedBackend();

    const app = mountApp();
    await flushPromises();

    expect(app.find('[data-part="toast"]').exists()).toBe(false);
  });

  it("stops listening for hotplug once unmounted", async () => {
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    app.unmount();
    backend.setDevices([]);
    await flushPromises();

    expect(app.text()).toContain(MAXWELL2_XBOX.name);
  });
});
