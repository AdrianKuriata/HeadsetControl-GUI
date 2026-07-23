import { BackendCallError } from "./backend";
import type { HeadsetBackend } from "./backend";
import type { AppEvent, ProbeFailure } from "./state-machine";

/**
 * The startup probe: one question — can we reach a working `headsetcontrol`,
 * and what is connected?
 *
 * Real binary detection (found? version? udev permissions?) lands with #9 and
 * will map to the richer {@link ProbeFailure} values. Until then every failure
 * is reported as a missing binary, which is the screen that tells the user how
 * to get one.
 */
export async function probe(backend: HeadsetBackend): Promise<AppEvent> {
  try {
    return { kind: "probe-succeeded", devices: await backend.listDevices() };
  } catch (error) {
    return { kind: "probe-failed", failure: probeFailure(error) };
  }
}

function probeFailure(error: unknown): ProbeFailure {
  if (error instanceof BackendCallError) {
    return { kind: "missing-binary" };
  }
  throw error;
}
