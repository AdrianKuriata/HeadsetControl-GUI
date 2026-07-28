import type { Page } from "@playwright/test";

import { MOCK_BACKEND_GLOBAL, MOCK_SCENARIO_GLOBAL } from "../src/core/create-backend";
import { MAXWELL2_XBOX } from "../src/core/mock-backend";
import type { MockScenario } from "../src/core/mock-backend";
import type { BackendError, Device } from "../src/core/types.gen";

export { MAXWELL2_XBOX };

/** A second headset, so hotplug has something else to report. */
export const ARCTIS: Device = {
  id: "1038:12aa",
  name: "SteelSeries Arctis",
  vendor: "SteelSeries",
  product: "Arctis Nova Pro Wireless",
  vendorId: 0x1038,
  productId: 0x12aa,
  capabilities: ["CAP_SIDETONE", "CAP_BATTERY_STATUS", "CAP_LIGHTS"],
};

/** The half of `MockBackend` the suite drives from inside the page. */
interface MockHandle {
  setDevices(devices: Device[]): void;
  fail(operation: string, failure: { kind: "error"; error: BackendError } | null): void;
  writes: { deviceId: string; param: string; value: unknown }[];
}

/**
 * Loads the app with the mock already scripted.
 *
 * The scenario has to be parked *before* the bundle runs: the app probes on
 * mount, so anything set afterwards would only be seen by the next event.
 */
export async function boot(page: Page, scenario: Partial<MockScenario> = {}): Promise<void> {
  await page.addInitScript(
    ([key, parked]) => {
      (window as unknown as Record<string, unknown>)[key as string] = parked;
    },
    [MOCK_SCENARIO_GLOBAL, scenario] as const,
  );

  await page.goto("/");
}

/** A hotplug event: what is connected now. */
export async function plug(page: Page, devices: Device[]): Promise<void> {
  await page.evaluate(
    ({ key, connected }) => {
      const mock = (window as unknown as Record<string, MockHandle | undefined>)[key];
      if (!mock) {
        throw new Error(`the mock backend is not on the page as ${key}`);
      }
      mock.setDevices(connected);
    },
    { key: MOCK_BACKEND_GLOBAL, connected: devices },
  );
}

/** Makes the device refuse every write until the page is reloaded. */
export async function refuseWrites(page: Page, message: string): Promise<void> {
  await page.evaluate(
    ({ key, reason }) => {
      const mock = (window as unknown as Record<string, MockHandle | undefined>)[key];
      if (!mock) {
        throw new Error(`the mock backend is not on the page as ${key}`);
      }
      mock.fail("setParam", { kind: "error", error: { kind: "failed", message: reason } });
    },
    { key: MOCK_BACKEND_GLOBAL, reason: message },
  );
}

/** What the app has written to the device so far. */
export async function writes(page: Page): Promise<MockHandle["writes"]> {
  return page.evaluate((key) => {
    const mock = (window as unknown as Record<string, MockHandle | undefined>)[key];
    if (!mock) {
      throw new Error(`the mock backend is not on the page as ${key}`);
    }
    return mock.writes;
  }, MOCK_BACKEND_GLOBAL);
}
