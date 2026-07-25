<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import HReadout from "../controls/HReadout.vue";
import HRow from "../controls/HRow.vue";
import HStepper from "../controls/HStepper.vue";
import { asInt, int } from "./contract";
import type { FeatureEmits, FeatureProps } from "./contract";

// `headsetcontrol -i <0-90>` takes any minute count; walking it one minute at a
// time would be absurd, so the stepper visits the values a person actually
// picks. 0 is the CLI's own "never".
const LADDER = [0, 5, 10, 15, 30, 45, 60, 90];

const props = defineProps<FeatureProps>();
const emit = defineEmits<FeatureEmits>();
const { t } = useI18n({ useScope: "global" });

const minutes = computed(() => asInt(props.value) ?? 0);

/** The rung the current value sits on, or the nearest one below it. */
const rung = computed(() => {
  const above = LADDER.findIndex((step) => step >= minutes.value);
  return above === -1 ? LADDER.length - 1 : above;
});

const label = computed(() =>
  minutes.value === 0
    ? t("features.inactiveTime.never")
    : t("features.inactiveTime.minutes", { count: minutes.value }),
);

const readout = computed(() =>
  asInt(props.value) === undefined ? t("features.unknown") : label.value,
);

function step(direction: -1 | 1): void {
  const next = LADDER[rung.value + direction];
  if (next !== undefined) {
    emit("change", int(next));
  }
}
</script>

<template>
  <HRow
    :name="t('features.inactiveTime.name')"
    :description="t('features.inactiveTime.description')"
  >
    <HStepper
      :decrement-label="t('features.inactiveTime.shorter')"
      :increment-label="t('features.inactiveTime.longer')"
      :at-min="rung === 0"
      :at-max="rung === LADDER.length - 1"
      @step="step"
      >{{ label }}</HStepper
    >
    <template #value>
      <HReadout>
        <span data-part="after">{{ readout }}</span>
      </HReadout>
    </template>
  </HRow>
</template>
