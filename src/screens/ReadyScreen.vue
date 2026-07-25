<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { Device, DeviceState, ParamValue } from "../core/types.gen";
import { featureRows } from "../features/registry";

// The screen is rendered from what the device says it can do: the header, then
// one row per capability, in the order reported (PROJECT.md §3.4). It knows no
// capability by name — `features/registry.ts` does the mapping, so a new
// feature never touches this file.
const { t } = useI18n({ useScope: "global" });

const props = defineProps<{
  device: Device;
  /** Live values from the refresh loop (#10); `null` until the first read. */
  readings?: DeviceState | null;
  /** The last value written per capability (#11). */
  params?: Record<string, ParamValue>;
}>();

defineEmits<{ write: [capability: string, value: ParamValue] }>();

const rows = computed(() => featureRows(props.device.capabilities));

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
  <section class="flex h-full flex-col gap-3 py-10">
    <header class="flex flex-col gap-3">
      <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">{{ device.name }}</h1>
      <p class="max-w-[62ch] text-mid">{{ device.product }}</p>
      <dl class="flex gap-3 font-mono text-[11.5px] tracking-[0.08em] uppercase">
        <dt class="text-low">{{ t("screens.ready.battery") }}</dt>
        <dd class="text-mid" data-part="battery">{{ battery }}</dd>
      </dl>
    </header>

    <div class="mt-6 flex flex-col">
      <component
        :is="row.component"
        v-for="row in rows"
        :key="row.capability"
        :data-capability="row.capability"
        :value="params?.[row.capability]"
        :readings="readings"
        @change="$emit('write', row.capability, $event)"
      />
    </div>
  </section>
</template>
