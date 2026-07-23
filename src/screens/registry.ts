import type { Component } from "vue";

import type { AppState } from "../core/state-machine";
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

/** The props a state hands to its screen. */
export function screenProps(state: AppState): Record<string, unknown> {
  switch (state.kind) {
    case "ready":
    case "device-lost":
      return { device: state.device };

    case "bad-version":
      return { found: state.found, required: state.required };

    default:
      return {};
  }
}
