import type { HeadsetBackend } from "./backend";
import { tauriBackend } from "./backend";
import { MockBackend } from "./mock-backend";
import type { MockScenario } from "./mock-backend";

/** Value of `VITE_BACKEND` that swaps the real IPC for the scripted mock. */
export const MOCK_BACKEND_FLAG = "mock";

/** Where the mock is parked so Playwright (#13) can script it from the page. */
export const MOCK_BACKEND_GLOBAL = "__headsetDeckMock";

/**
 * Where the E2E suite leaves the scenario the mock should *boot* with, before
 * the app has started. Scripting it afterwards can only change a running app —
 * this is how a test starts one with no headset, an old binary or no
 * permissions at all.
 */
export const MOCK_SCENARIO_GLOBAL = "__headsetDeckScenario";

let mockBackend: MockBackend | undefined;

/** Drops the memoized mock. Tests only — each one starts from a clean page. */
export function resetBackend(): void {
  mockBackend = undefined;
}

/**
 * Picks the backend the app runs against. `VITE_BACKEND=mock` selects the
 * scripted one — that is how `make dev-mock` runs without hardware and how the
 * E2E suite drives hotplug, failures and delays.
 *
 * A build made without that flag has no mock to pick: `__MOCK_BACKEND__` is a
 * literal `false` there, so the branch below is dead and the bundler drops
 * {@link MockBackend} and its fixture device along with it. Test seams should
 * not ship, and neither should the `window` handle that scripts them.
 */
export function createBackend(
  flag: string | undefined = import.meta.env.VITE_BACKEND,
): HeadsetBackend {
  if (!__MOCK_BACKEND__ || flag !== MOCK_BACKEND_FLAG) {
    return tauriBackend;
  }

  // One mock per page: a test that scripted devices or failures before the app
  // booted must be talking to the same instance the app then uses.
  mockBackend ??= new MockBackend(bootScenario());
  (window as unknown as Record<string, unknown>)[MOCK_BACKEND_GLOBAL] = mockBackend;
  return mockBackend;
}

function bootScenario(): Partial<MockScenario> {
  const parked = (window as unknown as Record<string, unknown>)[MOCK_SCENARIO_GLOBAL];
  return (parked as Partial<MockScenario> | undefined) ?? {};
}
