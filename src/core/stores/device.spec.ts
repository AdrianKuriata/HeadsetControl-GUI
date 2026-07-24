import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { MAXWELL2_XBOX, MockBackend } from "../mock-backend";
import type { ParamValue } from "../types.gen";
import { useDeviceStore } from "./device";

const SIDETONE = "CAP_SIDETONE";
const LOUD: ParamValue = { kind: "int", value: 96 };
const QUIET: ParamValue = { kind: "int", value: 12 };
const OTHER_HEADSET = "1038:12aa";

/** How the mock reports a device that refused. */
const REFUSED = {
  kind: "error",
  error: { kind: "failed", message: "device is asleep" },
} as const;

const READINGS = { battery: { status: "available", level: 92 }, chatmix: 64 };

/** A store already pointed at the reference headset. */
function focused() {
  const store = useDeviceStore();
  store.focus(MAXWELL2_XBOX.id);
  return store;
}

describe("the device store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts out pointed at nothing", () => {
    const store = useDeviceStore();

    expect(store.deviceId).toBeNull();
    expect(store.readings).toBeNull();
    expect(store.params).toEqual({});
    expect(store.failure).toBeNull();
  });

  describe("reading", () => {
    it("takes the values the device reports", async () => {
      const store = focused();

      await store.refresh(new MockBackend());

      expect(store.readings).toEqual(READINGS);
    });

    it("reads nothing while there is no headset", async () => {
      const store = useDeviceStore();
      const backend = new MockBackend();

      await store.refresh(backend);

      expect(store.readings).toBeNull();
    });

    it("keeps the last values when a read fails", async () => {
      const store = focused();
      const backend = new MockBackend();
      await store.refresh(backend);

      backend.fail("deviceState", REFUSED);
      await store.refresh(backend);

      expect(store.readings).toEqual(READINGS);
    });

    it("drops a reading that arrives after the headset was swapped", async () => {
      const store = focused();
      const slow = new MockBackend({ latencyMs: 5 });

      const reading = store.refresh(slow);
      store.focus(OTHER_HEADSET);
      await reading;

      expect(store.readings).toBeNull();
    });
  });

  describe("writing", () => {
    it("applies the value and sends it to the device", async () => {
      const store = focused();
      const backend = new MockBackend();

      await store.write(backend, SIDETONE, LOUD);

      expect(store.params[SIDETONE]).toEqual(LOUD);
      expect(backend.writes).toEqual([
        { deviceId: MAXWELL2_XBOX.id, param: SIDETONE, value: LOUD },
      ]);
      expect(store.failure).toBeNull();
    });

    it("applies the value before the device has answered", async () => {
      const store = focused();
      const backend = new MockBackend({ latencyMs: 5 });

      const writing = store.write(backend, SIDETONE, LOUD);

      expect(store.params[SIDETONE]).toEqual(LOUD);
      await writing;
    });

    it("writes nothing while there is no headset", async () => {
      const store = useDeviceStore();
      const backend = new MockBackend();

      await store.write(backend, SIDETONE, LOUD);

      expect(backend.writes).toEqual([]);
      expect(store.params).toEqual({});
    });

    it("rolls back to the previous value when the device refuses", async () => {
      const store = focused();
      const backend = new MockBackend();
      await store.write(backend, SIDETONE, QUIET);

      backend.fail("setParam", REFUSED);
      await store.write(backend, SIDETONE, LOUD);

      expect(store.params[SIDETONE]).toEqual(QUIET);
    });

    it("rolls back to nothing when there was no previous value", async () => {
      const store = focused();
      const backend = new MockBackend();
      backend.fail("setParam", REFUSED);

      await store.write(backend, SIDETONE, LOUD);

      expect(store.params).toEqual({});
    });

    it("reports the refusal for the toast", async () => {
      const store = focused();
      const backend = new MockBackend();
      backend.fail("setParam", REFUSED);

      await store.write(backend, SIDETONE, LOUD);

      expect(store.failure).toEqual({ capability: SIDETONE, reason: REFUSED.error });
    });

    it("keeps a newer value when an older write fails late", async () => {
      const store = focused();
      const slow = new MockBackend({ latencyMs: 5 });
      slow.fail("setParam", REFUSED);
      const fast = new MockBackend();

      const failing = store.write(slow, SIDETONE, LOUD);
      await store.write(fast, SIDETONE, QUIET);
      await failing;

      // The user moved the slider again while the first write was in flight;
      // its failure may complain, but it may not undo what came after.
      expect(store.params[SIDETONE]).toEqual(QUIET);
      expect(store.failure).toEqual({ capability: SIDETONE, reason: REFUSED.error });
    });

    it("says nothing about a headset the user has already left", async () => {
      const store = focused();
      const slow = new MockBackend({ latencyMs: 5 });
      slow.fail("setParam", REFUSED);

      const failing = store.write(slow, SIDETONE, LOUD);
      store.focus(OTHER_HEADSET);
      await failing;

      expect(store.failure).toBeNull();
      expect(store.params).toEqual({});
    });

    it("lets an unexpected error through", async () => {
      const store = focused();
      const backend = new MockBackend();
      backend.setParam = () => Promise.reject(new TypeError("boom"));

      await expect(store.write(backend, SIDETONE, LOUD)).rejects.toThrow(TypeError);
    });
  });

  it("drops the failure once it is acknowledged", async () => {
    const store = focused();
    const backend = new MockBackend();
    backend.fail("setParam", REFUSED);
    await store.write(backend, SIDETONE, LOUD);

    store.dismiss();

    expect(store.failure).toBeNull();
  });

  describe("changing headsets", () => {
    it("forgets everything the previous one had", async () => {
      const store = focused();
      const backend = new MockBackend();
      await store.refresh(backend);
      await store.write(backend, SIDETONE, LOUD);
      backend.fail("setParam", REFUSED);
      await store.write(backend, SIDETONE, QUIET);

      store.focus(OTHER_HEADSET);

      expect(store.readings).toBeNull();
      expect(store.params).toEqual({});
      expect(store.failure).toBeNull();
    });

    it("keeps what it knows when pointed at the same headset again", async () => {
      const store = focused();
      await store.refresh(new MockBackend());

      // Every hotplug event re-focuses; the values must survive one.
      store.focus(MAXWELL2_XBOX.id);

      expect(store.readings).toEqual(READINGS);
    });

    it("forgets everything when there is no headset left", async () => {
      const store = focused();
      await store.refresh(new MockBackend());

      store.focus(null);

      expect(store.deviceId).toBeNull();
      expect(store.readings).toBeNull();
    });
  });
});
