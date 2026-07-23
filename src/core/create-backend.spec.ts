import { afterEach, describe, expect, it } from "vitest";

import { tauriBackend } from "./backend";
import { MOCK_BACKEND_FLAG, MOCK_BACKEND_GLOBAL, createBackend } from "./create-backend";
import { MockBackend } from "./mock-backend";

describe("createBackend", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[MOCK_BACKEND_GLOBAL];
  });

  it("uses the real IPC backend by default", () => {
    expect(createBackend(undefined)).toBe(tauriBackend);
  });

  it("uses the real IPC backend for any other flag value", () => {
    expect(createBackend("tauri")).toBe(tauriBackend);
  });

  it("uses the mock backend when the flag asks for it", () => {
    expect(createBackend(MOCK_BACKEND_FLAG)).toBeInstanceOf(MockBackend);
  });

  it("exposes the mock on window so E2E tests can script it", () => {
    const backend = createBackend(MOCK_BACKEND_FLAG);

    expect((window as unknown as Record<string, unknown>)[MOCK_BACKEND_GLOBAL]).toBe(backend);
  });
});
