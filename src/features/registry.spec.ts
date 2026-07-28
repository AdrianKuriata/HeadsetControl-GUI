import { afterEach, describe, expect, it, vi } from "vitest";

import { at } from "../test-support";
import SidetoneRow from "./SidetoneRow.vue";
import { FEATURES, featureRows } from "./registry";

describe("the feature registry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders one row per known capability, in the order reported", () => {
    const rows = featureRows(["CAP_NOISE_FILTER", "CAP_SIDETONE"]);

    expect(rows.map((row) => row.capability)).toEqual(["CAP_NOISE_FILTER", "CAP_SIDETONE"]);
    expect(at(rows, 1).component).toBe(SidetoneRow);
  });

  it("renders nothing for a device that reports nothing", () => {
    expect(featureRows([])).toEqual([]);
  });

  it("skips a capability this build has never heard of, and says so", () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});

    const rows = featureRows(["CAP_SIDETONE", "CAP_FROM_THE_FUTURE"]);

    expect(rows.map((row) => row.capability)).toEqual(["CAP_SIDETONE"]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("CAP_FROM_THE_FUTURE"));
  });

  it("says nothing about a capability that is shown outside the rows", () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});

    // The battery is in the device header, not a row: known, just not here.
    expect(featureRows(["CAP_BATTERY_STATUS"])).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("supports a new feature with one entry and no edit anywhere else", () => {
    // The OCP claim of PROJECT.md §3.4, made concrete: a component nobody has
    // ever heard of renders as soon as the map names it.
    const NewRow = { template: "<div />" };
    FEATURES.CAP_FROM_THE_FUTURE = NewRow;

    try {
      expect(featureRows(["CAP_FROM_THE_FUTURE"])).toEqual([
        { capability: "CAP_FROM_THE_FUTURE", component: NewRow },
      ]);
    } finally {
      delete FEATURES.CAP_FROM_THE_FUTURE;
    }
  });
});
