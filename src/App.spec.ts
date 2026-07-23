import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";

import App from "./App.vue";
import { MOCK_BACKEND_FLAG, createBackend, resetBackend } from "./core/create-backend";
import type { MockBackend } from "./core/mock-backend";
import { MAXWELL2_XBOX } from "./core/mock-backend";
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

  it("keeps the current screen when a hotplug refresh fails", async () => {
    const backend = scriptedBackend();
    const app = mountApp();
    await flushPromises();

    backend.fail("listDevices", { kind: "error", error: { kind: "failed", message: "gone" } });
    backend.setDevices([]);
    await flushPromises();

    expect(app.text()).toContain(MAXWELL2_XBOX.name);
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
