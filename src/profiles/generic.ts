import type { DeviceProfile } from "./types";

/**
 * What a headset with no profile of its own gets: nothing overridden.
 *
 * That is not a degraded mode — capabilities come from the device itself, so an
 * unknown headset is fully usable. It simply renders neutral, without a
 * platform accent (PROJECT.md §2).
 */
export const GENERIC_PROFILE: DeviceProfile = {};
