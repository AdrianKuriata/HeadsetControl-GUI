import { describe, expect, it } from "vitest";

import { BackendCallError } from "./backend";
import { MAXWELL2_XBOX, MockBackend } from "./mock-backend";
import { probe } from "./probe";

describe("probe", () => {
  it("reports the connected devices", async () => {
    await expect(probe(new MockBackend())).resolves.toEqual({
      kind: "probe-succeeded",
      devices: [MAXWELL2_XBOX],
    });
  });

  it("reports a backend failure as a missing binary until #9 detects the real cause", async () => {
    const backend = new MockBackend();
    backend.fail("listDevices", { kind: "error", error: { kind: "not_implemented" } });

    await expect(probe(backend)).resolves.toEqual({
      kind: "probe-failed",
      failure: { kind: "missing-binary" },
    });
  });

  it("lets an unexpected error through instead of disguising it as a probe failure", async () => {
    const backend = new MockBackend();
    backend.listDevices = () => Promise.reject(new TypeError("boom"));

    await expect(probe(backend)).rejects.toThrow(TypeError);
  });

  it("only swallows backend errors", () => {
    expect(new BackendCallError({ kind: "not_implemented" })).toBeInstanceOf(Error);
  });
});
