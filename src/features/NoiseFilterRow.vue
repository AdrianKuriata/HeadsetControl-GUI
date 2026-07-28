<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import HOptions from "../controls/HOptions.vue";
import HReadout from "../controls/HReadout.vue";
import HRow from "../controls/HRow.vue";
import { asInt, int } from "./contract";
import type { FeatureEmits, FeatureProps } from "./contract";

/** `headsetcontrol --noise-filter <0|1|2>` — off, low, high. */
const LEVELS = ["off", "low", "high"] as const;

const props = defineProps<FeatureProps>();
const emit = defineEmits<FeatureEmits>();
const { t } = useI18n({ useScope: "global" });

const options = computed(() =>
  LEVELS.map((level, value) => ({ value, label: t(`features.noiseFilter.${level}`) })),
);

// -1 matches no option, which is how "nothing written yet" renders: the group
// stays reachable but nothing is marked as chosen.
const selected = computed(() => asInt(props.value) ?? -1);
const readout = computed(() => {
  const level = LEVELS[selected.value];
  return level ? t(`features.noiseFilter.${level}`) : t("features.unknown");
});
</script>

<template>
  <HRow :name="t('features.noiseFilter.name')" :description="t('features.noiseFilter.description')">
    <HOptions
      :model-value="selected"
      :options="options"
      :label="t('features.noiseFilter.name')"
      @update:model-value="emit('change', int($event))"
    />
    <template #value>
      <HReadout
        ><span data-part="level">{{ readout }}</span></HReadout
      >
    </template>
  </HRow>
</template>
