import type { Component } from "vue";

import ChatmixRow from "./ChatmixRow.vue";
import EqualizerSection from "./EqualizerSection.vue";
import InactiveTimeRow from "./InactiveTimeRow.vue";
import LightsRow from "./LightsRow.vue";
import NoiseFilterRow from "./NoiseFilterRow.vue";
import SidetoneRow from "./SidetoneRow.vue";
import VoicePromptsRow from "./VoicePromptsRow.vue";

/**
 * One capability, one component — the extension seam of the whole app
 * (PROJECT.md §3.4). Supporting a new `headsetcontrol` feature is a new file in
 * this folder plus one line here; nothing else in the app changes.
 *
 * The keys are the raw `CAP_*` identifiers the device reports, so a capability
 * this build has never heard of is simply absent from the map.
 */
export const FEATURES: Record<string, Component> = {
  CAP_SIDETONE: SidetoneRow,
  CAP_CHATMIX_STATUS: ChatmixRow,
  CAP_NOISE_FILTER: NoiseFilterRow,
  CAP_VOICE_PROMPTS: VoicePromptsRow,
  CAP_LIGHTS: LightsRow,
  CAP_INACTIVE_TIME: InactiveTimeRow,
  CAP_EQUALIZER_PRESET: EqualizerSection,
};

/**
 * Capabilities that are shown, but not as a row: the battery is part of the
 * device header. Listed so they are not mistaken for capabilities this build
 * does not know.
 */
const ELSEWHERE = new Set(["CAP_BATTERY_STATUS"]);

/** A capability and the component that renders it, in the order reported. */
export interface FeatureRow {
  capability: string;
  component: Component;
}

/**
 * The rows to render for a device, in the order it reports its capabilities.
 *
 * A capability with no component is logged and skipped — a newer binary
 * reporting something this build cannot render must never be a crash
 * (forward compatibility, PROJECT.md §3.3).
 */
export function featureRows(capabilities: readonly string[]): FeatureRow[] {
  return capabilities.flatMap((capability) => {
    const component = FEATURES[capability];

    if (component) {
      return [{ capability, component }];
    }

    if (!ELSEWHERE.has(capability)) {
      console.info(`no component for capability ${capability}, skipping it`);
    }

    return [];
  });
}
