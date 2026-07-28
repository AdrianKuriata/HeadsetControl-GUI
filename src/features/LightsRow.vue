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
  { value: true, label: t("features.lights.on") },
  { value: false, label: t("features.lights.off") },
]);

const lit = computed(() => asBool(props.value));
const readout = computed(() => {
  if (lit.value === undefined) return t("features.unknown");
  return lit.value ? t("features.lights.on") : t("features.lights.off");
});
</script>

<template>
  <HRow :name="t('features.lights.name')" :description="t('features.lights.description')">
    <HOptions
      :model-value="lit ?? null"
      :options="options"
      :label="t('features.lights.name')"
      @update:model-value="emit('change', bool($event))"
    />
    <template #value>
      <HReadout>
        <span data-part="state">{{ readout }}</span>
      </HReadout>
    </template>
  </HRow>
</template>
