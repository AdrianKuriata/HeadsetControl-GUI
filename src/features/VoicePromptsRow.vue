<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import HOptions from "../controls/HOptions.vue";
import HReadout from "../controls/HReadout.vue";
import HRow from "../controls/HRow.vue";
import { asBool, bool } from "./contract";
import type { FeatureEmits, FeatureProps } from "./contract";

const props = defineProps<FeatureProps>();
const emit = defineEmits<FeatureEmits>();
const { t } = useI18n({ useScope: "global" });

const options = computed(() => [
  { value: true, label: t("features.voicePrompts.on") },
  { value: false, label: t("features.voicePrompts.off") },
]);

const enabled = computed(() => asBool(props.value));
const readout = computed(() => {
  if (enabled.value === undefined) return t("features.unknown");
  return enabled.value ? t("features.voicePrompts.active") : t("features.voicePrompts.off");
});
</script>

<template>
  <HRow :name="t('features.voicePrompts.name')">
    <HOptions
      :model-value="enabled ?? null"
      :options="options"
      :label="t('features.voicePrompts.name')"
      @update:model-value="emit('change', bool($event))"
    />
    <template #value>
      <HReadout>
        <span data-part="state">{{ readout }}</span>
      </HReadout>
    </template>
  </HRow>
</template>
