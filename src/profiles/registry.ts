import type { DeviceKey, DeviceProfile, Platform } from "./types";
import { GENERIC_PROFILE } from "./generic";

/**
 * `(vendorId, productId)` → the model's profile. A model sold as several
 * variants has one entry per product id, all pointing at the same profile — the
 * profile's `variants` map is what tells them apart.
 *
 * Adding a headset is a new file in `src/profiles/` plus one line here.
 */
export const PROFILES: Record<string, DeviceProfile> = {};

/** The key a device is looked up by. Hex, like the CLI reports the ids. */
export function profileKey({ vendorId, productId }: DeviceKey): string {
  return `${hex(vendorId)}:${hex(productId)}`;
}

/** The device's profile, or the generic one — never nothing. */
export function profileFor(device: DeviceKey): DeviceProfile {
  return PROFILES[profileKey(device)] ?? GENERIC_PROFILE;
}

/**
 * Which platform this particular device is the variant for, or `null` when
 * nothing says. `null` is the neutral, accent-less theme — the honest answer
 * for an unknown headset, and never an error.
 */
export function platformFor(device: DeviceKey): Platform | null {
  return profileFor(device).variants?.[device.productId] ?? null;
}

function hex(id: number): string {
  return id.toString(16).padStart(4, "0");
}
