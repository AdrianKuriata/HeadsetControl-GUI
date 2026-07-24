import { BackendCallError } from "./backend";
import type { HeadsetBackend } from "./backend";
import type { AppEvent, ProbeFailure } from "./state-machine";
import type { Detection, DeviceState } from "./types.gen";

/**
 * The startup probe: two questions, in the order that makes the answers
 * meaningful — is there a usable `headsetcontrol` (#9), and what is connected.
 *
 * Detection comes first because its verdicts are the screens that tell the user
 * what to do about it; a device list read from a binary that cannot reach the
 * hardware would only look like "no headset connected".
 */
export async function probe(backend: HeadsetBackend): Promise<AppEvent> {
  const detection = await backend.detect();

  if (detection.kind !== "ready") {
    return { kind: "probe-failed", failure: probeFailure(detection) };
  }

  try {
    return { kind: "probe-succeeded", devices: await backend.listDevices() };
  } catch (error) {
    // Between the two calls the binary can still go away (an upgrade, a
    // removed package); reporting it as missing sends the user to the screen
    // that says how to get it back.
    rethrowUnexpected(error);
    return { kind: "probe-failed", failure: { kind: "missing-binary" } };
  }
}

/**
 * A hotplug refresh — the device list, nothing else.
 *
 * Deliberately *not* the full probe: a headset being plugged in is no reason to
 * re-check the binary's version or its permissions, and doing so would spawn
 * the CLI twice on every event. Resolves to nothing when the list cannot be
 * read, leaving the current screen alone until the next event or a retry.
 */
export async function refreshDevices(backend: HeadsetBackend): Promise<AppEvent | undefined> {
  try {
    return { kind: "devices-changed", devices: await backend.listDevices() };
  } catch (error) {
    rethrowUnexpected(error);
    return undefined;
  }
}

/**
 * The live values of one device — battery, chatmix — re-read on the refresh
 * loop's tick (#10).
 *
 * Resolves to nothing when the read fails, which is routine: a headset that
 * went to sleep between two ticks answers with an error, and the app keeps
 * showing what it last knew rather than blanking the screen.
 */
export async function readDeviceState(
  backend: HeadsetBackend,
  deviceId: string,
): Promise<DeviceState | undefined> {
  try {
    return await backend.deviceState(deviceId);
  } catch (error) {
    rethrowUnexpected(error);
    return undefined;
  }
}

/** The detection verdicts, as the state machine names them. */
function probeFailure(detection: Exclude<Detection, { kind: "ready" }>): ProbeFailure {
  switch (detection.kind) {
    case "missing_binary":
      return { kind: "missing-binary" };

    case "bad_version":
      return { kind: "bad-version", found: detection.found, required: detection.required };

    case "no_permissions":
      return { kind: "no-permissions" };
  }
}

/**
 * Backend failures are expected — a binary that vanished mid-call is not a bug.
 * Anything else is one, and must not be swallowed into a screen.
 */
function rethrowUnexpected(error: unknown): void {
  if (!(error instanceof BackendCallError)) {
    throw error;
  }
}
