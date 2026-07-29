import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { MAXWELL2_XBOX, MockBackend } from "../mock-backend";
import type { ParamValue } from "../types.gen";
import { useDeviceStore } from "./device";

const SIDETONE = "CAP_SIDETONE";
const NOISE_FILTER = "CAP_NOISE_FILTER";
const LOUD: ParamValue = { kind: "int", value: 96 };
const MID: ParamValue = { kind: "int", value: 40 };
const QUIET: ParamValue = { kind: "int", value: 12 };
const ON: ParamValue = { kind: "bool", value: true };
const OTHER_HEADSET = "1038:12aa";

/**
 * A backend whose *first* write never finishes until it is let go, so a test can
 * pile more writes on top of a call that is still in flight — no timers, and no
 * dependence on how many microtasks the store happens to await.
 */
function holding() {
  const backend = new MockBackend();
  const sent: ParamValue[] = [];
  let held: (() => void) | undefined;

  backend.setParam = (_deviceId, _param, value) => {
    sent.push(value);

    if (sent.length > 1) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      held = resolve;
    });
  };

  return { backend, sent, release: () => held?.() };
}

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

    it("collapses a burst to one more call, carrying the newest value", async () => {
      const store = focused();
      const { backend, sent, release } = holding();

      // What a drag looks like: the first value goes on the wire, and every
      // value after it arrives while that call is still running. Each one costs
      // ~3 s on the reference headset, so they must not queue up (#52).
      const first = store.write(backend, SIDETONE, QUIET);
      void store.write(backend, SIDETONE, MID);
      void store.write(backend, SIDETONE, LOUD);

      expect(sent).toEqual([QUIET]);
      // The screen is already where the finger is; only the wire is throttled.
      expect(store.params[SIDETONE]).toEqual(LOUD);

      release();
      await first;

      expect(sent).toEqual([QUIET, LOUD]);
    });

    it("does not make one capability wait behind another", async () => {
      const store = focused();
      const { backend, sent, release } = holding();

      const first = store.write(backend, SIDETONE, LOUD);
      await store.write(backend, NOISE_FILTER, ON);

      // Different capabilities are different calls; only the same one collapses.
      expect(sent).toEqual([LOUD, ON]);

      release();
      await first;
    });

    it("drops what was queued when the user switches headsets", async () => {
      const store = focused();
      const { backend, sent, release } = holding();

      const first = store.write(backend, SIDETONE, QUIET);
      void store.write(backend, SIDETONE, LOUD);
      store.focus(OTHER_HEADSET);

      release();
      await first;

      // The queued value was meant for a headset the user has left.
      expect(sent).toEqual([QUIET]);
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
