<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { Device, DeviceState } from "../core/types.gen";

// One placeholder row per reported capability. The capability → component map
// (#12) replaces this; rendering the raw identifier is what keeps an unknown
// capability harmless in the meantime. Device name/product and the capability
// identifiers are data, not translatable copy.
const { t } = useI18n({ useScope: "global" });

const props = defineProps<{
  device: Device;
  /**
   * Live values from the refresh loop (#10); `null` until the first read.
   *
   * `undefined` is spelled out because `exactOptionalPropertyTypes` stops
   * treating "not passed" and "passed as undefined" as the same thing, and Vue
   * hands a component both.
   */
  readings?: DeviceState | null | undefined;
}>();

// A first readout of the polled values, in the same placeholder idiom as the
// capability list above: the real battery row arrives with the feature
// components (#12), fed from the device store (#11).
const battery = computed(() => {
  const reading = props.readings?.battery;

  if (!reading || reading.status === "unavailable") {
    return t("screens.ready.batteryUnavailable");
  }

  const level = reading.level === null ? "" : `${reading.level}%`;
  return reading.status === "charging" ? `${t("screens.ready.charging")} ${level}`.trim() : level;
});
</script>

<template>
  <section class="flex h-full flex-col justify-center gap-3 py-10">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">{{ device.name }}</h1>
    <p class="max-w-[62ch] text-mid">{{ device.product }}</p>
    <dl class="flex gap-3 font-mono text-[11.5px] tracking-[0.08em] uppercase">
      <dt class="text-low">{{ t("screens.ready.battery") }}</dt>
      <dd class="text-mid" data-part="battery">{{ battery }}</dd>
    </dl>
    <h2 class="font-mono text-[10px] tracking-[0.24em] text-low uppercase">
      {{ t("screens.ready.capabilities") }}
    </h2>
    <ul class="flex flex-col gap-1 font-mono text-[11.5px] tracking-[0.08em] text-mid">
      <li v-for="capability in device.capabilities" :key="capability">{{ capability }}</li>
    </ul>
  </section>
</template>
