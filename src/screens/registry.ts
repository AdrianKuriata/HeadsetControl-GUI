import type { Component } from "vue";

import type { AppState } from "../core/state-machine";
import type { DeviceState, ParamValue } from "../core/types.gen";
import BadVersionScreen from "./BadVersionScreen.vue";
import CheckingBinaryScreen from "./CheckingBinaryScreen.vue";
import DeviceLostScreen from "./DeviceLostScreen.vue";
import MissingBinaryScreen from "./MissingBinaryScreen.vue";
import NoDeviceScreen from "./NoDeviceScreen.vue";
import NoPermissionsScreen from "./NoPermissionsScreen.vue";
import ReadyScreen from "./ReadyScreen.vue";

/**
 * One state, one screen (PROJECT.md §3.3). Keeping the mapping as data rather
 * than a `v-if` chain in `App.vue` means a new state is a new entry here, and
 * the app shell has nothing to branch on.
 */
export const SCREENS: Record<AppState["kind"], Component> = {
  "checking-binary": CheckingBinaryScreen,
  "missing-binary": MissingBinaryScreen,
  "bad-version": BadVersionScreen,
  "no-permissions": NoPermissionsScreen,
  "no-device": NoDeviceScreen,
  ready: ReadyScreen,
  "device-lost": DeviceLostScreen,
};

/** What the device store knows about the headset on screen (#10, #11). */
export interface DeviceValues {
  /** Read back by the refresh loop; `null` until the first read. */
  readings: DeviceState | null;
  /** The last value written per capability. */
  params: Record<string, ParamValue>;
}

const NOTHING_KNOWN: DeviceValues = { readings: null, params: {} };

/**
 * The props a state hands to its screen.
 *
 * The values are passed alongside the state rather than inside it: a battery
 * percentage never decides which screen is shown, so it has no business in the
 * state machine.
 */
export function screenProps(
  state: AppState,
  values: DeviceValues = NOTHING_KNOWN,
): Record<string, unknown> {
  switch (state.kind) {
    case "ready":
      return { device: state.device, readings: values.readings, params: values.params };

    case "device-lost":
      return { device: state.device };

    case "bad-version":
      return { found: state.found, required: state.required };

    default:
      return {};
  }
}
