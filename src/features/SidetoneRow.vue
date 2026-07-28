<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import HReadout from "../controls/HReadout.vue";
import HRow from "../controls/HRow.vue";
import HSlider from "../controls/HSlider.vue";
import { asInt, int } from "./contract";
import type { FeatureEmits, FeatureProps } from "./contract";

/** `headsetcontrol -s <0-128>`; 0 turns sidetone off. */
const MAX = 128;

const props = defineProps<FeatureProps>();
const emit = defineEmits<FeatureEmits>();
const { t } = useI18n({ useScope: "global" });

const level = computed(() => asInt(props.value) ?? 0);
const known = computed(() => asInt(props.value) !== undefined);

const readout = computed(() => {
  if (!known.value) return t("features.unknown");
  return level.value === 0 ? t("features.sidetone.off") : String(level.value);
});
</script>

<template>
  <HRow :name="t('features.sidetone.name')" :description="t('features.sidetone.description')">
    <HSlider
      :model-value="level"
      :min="0"
      :max="MAX"
      :label="t('features.sidetone.name')"
      @update:model-value="emit('change', int($event))"
    />
    <template #value>
      <HReadout>
        <span data-part="level">{{ readout }}</span>
        <template v-if="known && level > 0" #suffix> / {{ MAX }}</template>
      </HReadout>
    </template>
  </HRow>
</template>
