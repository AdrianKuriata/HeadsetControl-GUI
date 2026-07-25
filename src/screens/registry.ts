import type { Component } from "vue";

import type { AppState } from "../core/state-machine";
import type { DeviceState } from "../core/types.gen";
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

/**
 * The props a state hands to its screen.
 *
 * `readings` are the values the refresh loop keeps up to date (#10); they are
 * not part of the state machine, because a battery percentage never decides
 * which screen is shown.
 */
export function screenProps(
  state: AppState,
  readings: DeviceState | null = null,
): Record<string, unknown> {
  switch (state.kind) {
    case "ready":
      return { device: state.device, readings };

    case "device-lost":
      return { device: state.device };

    case "bad-version":
      return { found: state.found, required: state.required };

    default:
      return {};
  }
}
