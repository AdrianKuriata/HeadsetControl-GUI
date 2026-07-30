import { defineStore } from "pinia";
import { ref } from "vue";

import { BackendCallError } from "../backend";
import type { HeadsetBackend } from "../backend";
import { readDeviceState } from "../probe";
import type { BackendError, DeviceState, ParamValue } from "../types.gen";

/** A write the headset refused, kept until the toast is dismissed. */
export interface WriteFailure {
  capability: string;
  reason: BackendError;
}

/** One write, with everything needed to send it later rather than now. */
interface Attempt {
  backend: HeadsetBackend;
  deviceId: string;
  capability: string;
  value: ParamValue;
  /** Identifies this write among the ones to the same capability. */
  ticket: number;
  /** What to restore if the device refuses and nothing newer has landed. */
  previous: ParamValue | undefined;
}

/**
 * The values of the headset on screen: what was read back, what was written,
 * and what the last write did wrong.
 *
 * Only battery and chatmix can be read from the CLI; every other capability is
 * write-only, so this store *is* the record of what was set (ADR 0009). It
 * knows which device it describes ({@link focus}), which is what lets a reply
 * that arrives after the user switched headsets be dropped instead of shown
 * against the wrong one. The backend is passed into the actions rather than
 * reached from here, so the layer is tested against `MockBackend` with nothing
 * installed.
 */
export const useDeviceStore = defineStore("device", () => {
  /** The headset everything here is about; `null` when there is none. */
  const deviceId = ref<string | null>(null);
  /** Read back by the refresh loop; `null` until the first successful read. */
  const readings = ref<DeviceState | null>(null);
  /** The last value written per capability. */
  const params = ref<Record<string, ParamValue>>({});
  /** The failure the toast shows, if any. */
  const failure = ref<WriteFailure | null>(null);

  // Which write is the newest one per capability. Comparing the stored value
  // instead would compare a reactive proxy with the raw object it wraps, and a
  // slider can produce two writes carrying equal values anyway.
  const newest = new Map<string, number>();
  let writes = 0;

  // At most one call on the wire per capability, and at most one value waiting
  // behind it — a newer one replaces what is queued rather than joining a queue.
  //
  // Without this a drag is unusable: the slider emits a value per pixel and a
  // single `headsetcontrol` invocation costs ~2.9 s on the reference headset,
  // which the runner serialises. Tens of writes then take minutes to drain and
  // the device replays every intermediate position of the drag long after the
  // user let go (#52). The optimistic update below is unaffected, so the readout
  // still follows the finger; only what reaches the device is thinned out.
  const sending = new Set<string>();
  const queued = new Map<string, Attempt>();

  /** Point the store at a headset. Another one (or none) starts from nothing. */
  function focus(id: string | null): void {
    if (id === deviceId.value) {
      return;
    }

    deviceId.value = id;
    readings.value = null;
    params.value = {};
    failure.value = null;
    newest.clear();
    // Anything still waiting was meant for the headset the user just left.
    queued.clear();
  }

  /**
   * One tick of the refresh loop. A read that fails leaves the last values in
   * place: a headset that went to sleep between two ticks has not changed
   * anything the user needs told about.
   */
  async function refresh(backend: HeadsetBackend): Promise<void> {
    const id = deviceId.value;
    if (id === null) {
      return;
    }

    const values = await readDeviceState(backend, id);

    if (values && deviceId.value === id) {
      readings.value = values;
    }
  }

  /**
   * An optimistic write: the value applies at once, and only a refusal from the
   * device undoes it (PROJECT.md §3.3). The rollback is guarded — if something
   * has been written to the same capability since, a slow failure must not
   * clobber the newer value; it only reports.
   *
   * Resolves once the device has been told — including whatever replaced this
   * value while the call was on the wire, since that write has no call of its
   * own to await.
   */
  async function write(
    backend: HeadsetBackend,
    capability: string,
    value: ParamValue,
  ): Promise<void> {
    const id = deviceId.value;
    if (id === null) {
      return;
    }

    const previous = params.value[capability];
    const ticket = ++writes;

    params.value[capability] = value;
    newest.set(capability, ticket);

    const attempt: Attempt = { backend, deviceId: id, capability, value, ticket, previous };

    // Someone is already talking to the device about this capability. Leave the
    // value behind them — replacing anything that was waiting — and let their
    // call carry it once it is free.
    if (sending.has(capability)) {
      queued.set(capability, attempt);
      return;
    }

    sending.add(capability);

    try {
      let next: Attempt | undefined = attempt;

      while (next) {
        await send(next);
        next = queued.get(capability);
        queued.delete(capability);
      }
    } finally {
      sending.delete(capability);
    }
  }

  /** One invocation, and what its refusal means for what is on screen. */
  async function send({
    backend,
    deviceId: id,
    capability,
    value,
    ticket,
    previous,
  }: Attempt): Promise<void> {
    try {
      await backend.setParam(id, capability, value);
    } catch (error) {
      // A backend failure is the device saying no; anything else is a bug and
      // must not be swallowed into a toast.
      if (!(error instanceof BackendCallError)) {
        throw error;
      }

      // The headset was swapped while the write was in flight: its refusal says
      // nothing about the one on screen now.
      if (deviceId.value !== id) {
        return;
      }

      if (newest.get(capability) === ticket) {
        rollback(capability, previous);
      }

      failure.value = { capability, reason: error.reason };
    }
  }

  function rollback(capability: string, previous: ParamValue | undefined): void {
    if (previous === undefined) {
      delete params.value[capability];
      return;
    }

    params.value[capability] = previous;
  }

  /** The toast was acknowledged. */
  function dismiss(): void {
    failure.value = null;
  }

  return { deviceId, readings, params, failure, focus, refresh, write, dismiss };
});

export type DeviceStore = ReturnType<typeof useDeviceStore>;
