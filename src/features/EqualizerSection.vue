<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import HOptions from "../controls/HOptions.vue";
import HReadout from "../controls/HReadout.vue";
import HRow from "../controls/HRow.vue";
import { asInt, int } from "./contract";
import type { FeatureEmits, FeatureProps } from "./contract";

// `headsetcontrol -p 0-9`. The presets are numbered here because their *names*
// are model knowledge, which belongs in `src/profiles/` (#17); the draggable
// curve and custom presets are the M2 equalizer (#16).
const PRESETS = 10;

const props = defineProps<FeatureProps>();
const emit = defineEmits<FeatureEmits>();
const { t } = useI18n({ useScope: "global" });

const options = computed(() =>
  Array.from({ length: PRESETS }, (_unused, value) => ({
    value,
    label: t("features.equalizer.preset", { number: value + 1 }),
  })),
);

const selected = computed(() => asInt(props.value) ?? -1);
const readout = computed(() =>
  selected.value < 0
    ? t("features.unknown")
    : t("features.equalizer.preset", { number: selected.value + 1 }),
);
</script>

<template>
  <HRow :name="t('features.equalizer.name')" :description="t('features.equalizer.description')">
    <HOptions
      class="flex-wrap gap-x-[26px] gap-y-1"
      :model-value="selected"
      :options="options"
      :label="t('features.equalizer.name')"
      @update:model-value="emit('change', int($event))"
    />
    <template #value>
      <HReadout>
        <span data-part="preset">{{ readout }}</span>
      </HReadout>
    </template>
  </HRow>
</template>
