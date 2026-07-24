import { beforeEach, describe, expect, it } from "vitest";

import { PLATFORM_ATTRIBUTE, applyPlatform } from "./theme";

describe("applyPlatform", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
  });

  it("scopes the accent variables to the platform", () => {
    applyPlatform("ps", root);

    expect(root.getAttribute(PLATFORM_ATTRIBUTE)).toBe("ps");
  });

  it("re-themes when another headset takes over", () => {
    applyPlatform("ps", root);
    applyPlatform("nintendo", root);

    expect(root.getAttribute(PLATFORM_ATTRIBUTE)).toBe("nintendo");
  });

  it("leaves the neutral accent in place when nothing says otherwise", () => {
    applyPlatform("xbox", root);
    applyPlatform(null, root);

    expect(root.hasAttribute(PLATFORM_ATTRIBUTE)).toBe(false);
  });

  it("themes the document by default", () => {
    applyPlatform("xbox");

    expect(document.documentElement.getAttribute(PLATFORM_ATTRIBUTE)).toBe("xbox");

    applyPlatform(null);
  });
});
