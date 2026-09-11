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
const NEVER = 0;
const SHORTEST = 5;
const LADDER = [NEVER, SHORTEST, 10, 15, 30, 45, 60, 90];

const props = defineProps<FeatureProps>();
const emit = defineEmits<FeatureEmits>();
const { t } = useI18n({ useScope: "global" });

const minutes = computed(() => asInt(props.value));

/** The rung the current value sits on, or the nearest one below it. */
const rung = computed(() => {
  const value = minutes.value;
  if (value === undefined) return null;

  const above = LADDER.findIndex((step) => step >= value);
  return above === -1 ? LADDER.length - 1 : above;
});

// "never" is a setting the CLI can be told to apply, so rendering it for a value
// nobody has written states something about the headset the app cannot know (#70).
const label = computed(() => {
  const value = minutes.value;
  if (value === undefined) return t("features.unknown");

  return value === NEVER
    ? t("features.inactiveTime.never")
    : t("features.inactiveTime.minutes", { count: value });
});

function step(direction: -1 | 1): void {
  if (rung.value === null) {
    // No rung to move from: each button commits to the end it points at rather
    // than pretending to know where the headset currently stands.
    emit("change", int(direction === 1 ? SHORTEST : NEVER));
    return;
  }

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
        <span data-part="after">{{ label }}</span>
      </HReadout>
    </template>
  </HRow>
</template>
