import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { MAXWELL2_XBOX } from "../mock-backend";
import type { Device } from "../types.gen";
import { useDevicesStore } from "./devices";

const OTHER: Device = {
  ...MAXWELL2_XBOX,
  id: "1038:12aa",
  name: "SteelSeries Arctis",
  vendorId: 0x1038,
  productId: 0x12aa,
};

describe("the devices store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts out knowing nothing", () => {
    const store = useDevicesStore();

    expect(store.devices).toEqual([]);
    expect(store.selected).toBeUndefined();
    expect(store.hasChoice).toBe(false);
  });

  it("takes the first device as the one being looked at", () => {
    const store = useDevicesStore();

    store.apply([MAXWELL2_XBOX, OTHER]);

    expect(store.selected).toEqual(MAXWELL2_XBOX);
    expect(store.hasChoice).toBe(true);
  });

  it("offers no choice with a single device", () => {
    const store = useDevicesStore();

    store.apply([MAXWELL2_XBOX]);

    expect(store.hasChoice).toBe(false);
  });

  it("follows the user's pick", () => {
    const store = useDevicesStore();
    store.apply([MAXWELL2_XBOX, OTHER]);

    store.select(OTHER.id);

    expect(store.selected).toEqual(OTHER);
  });

  it("ignores a pick nothing answers to", () => {
    const store = useDevicesStore();
    store.apply([MAXWELL2_XBOX]);

    store.select("dead:beef");

    expect(store.selected).toEqual(MAXWELL2_XBOX);
    expect(store.selectedId).toBeNull();
  });

  it("keeps the picked device across a hotplug that leaves it in place", () => {
    const store = useDevicesStore();
    store.apply([MAXWELL2_XBOX, OTHER]);
    store.select(OTHER.id);

    // The other headset was unplugged; the picked one is still there.
    store.apply([OTHER]);

    expect(store.selected).toEqual(OTHER);
  });

  it("re-selects the picked device when it comes back", () => {
    const store = useDevicesStore();
    store.apply([MAXWELL2_XBOX, OTHER]);
    store.select(OTHER.id);

    store.apply([MAXWELL2_XBOX]);
    expect(store.selected).toEqual(MAXWELL2_XBOX);

    store.apply([MAXWELL2_XBOX, OTHER]);
    expect(store.selected).toEqual(OTHER);
  });

  it("falls back to what is connected while the pick is away", () => {
    const store = useDevicesStore();
    store.apply([OTHER]);
    store.select(OTHER.id);

    store.apply([]);

    expect(store.selected).toBeUndefined();
  });

  it("takes the newest object for the device it is showing", () => {
    const store = useDevicesStore();
    store.apply([MAXWELL2_XBOX]);

    const renamed = { ...MAXWELL2_XBOX, name: "Audeze Maxwell 2 (firmware 1.2)" };
    store.apply([renamed]);

    expect(store.selected).toEqual(renamed);
  });
});
