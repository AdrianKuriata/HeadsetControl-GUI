import { describe, expect, it } from "vitest";

import { at } from "./test-support";

describe("at", () => {
  it("hands back the element at the index", () => {
    expect(at(["off", "low", "high"], 1)).toBe("low");
  });

  it("fails by name when the index is past the end", () => {
    // The point of the helper: a selector that stopped matching should say so,
    // not surface as `Cannot read properties of undefined` three lines later.
    expect(() => at(["only"], 2)).toThrow("expected an element at index 2, found 1");
  });
});
