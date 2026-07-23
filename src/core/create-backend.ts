import type { HeadsetBackend } from "./backend";
import { tauriBackend } from "./backend";
import { MockBackend } from "./mock-backend";

/** Value of `VITE_BACKEND` that swaps the real IPC for the scripted mock. */
export const MOCK_BACKEND_FLAG = "mock";

/** Where the mock is parked so Playwright (#13) can script it from the page. */
export const MOCK_BACKEND_GLOBAL = "__headsetDeckMock";

let mockBackend: MockBackend | undefined;

/** Drops the memoized mock. Tests only — each one starts from a clean page. */
export function resetBackend(): void {
  mockBackend = undefined;
}

/**
 * Picks the backend the app runs against. `VITE_BACKEND=mock` selects the
 * scripted one — that is how `make dev` runs without hardware and how the E2E
 * suite drives hotplug, failures and delays.
 */
export function createBackend(
  flag: string | undefined = import.meta.env.VITE_BACKEND,
): HeadsetBackend {
  if (flag !== MOCK_BACKEND_FLAG) {
    return tauriBackend;
  }

  // One mock per page: a test that scripted devices or failures before the app
  // booted must be talking to the same instance the app then uses.
  mockBackend ??= new MockBackend();
  (window as unknown as Record<string, unknown>)[MOCK_BACKEND_GLOBAL] = mockBackend;
  return mockBackend;
}
