<script setup lang="ts">
import { computed } from "vue";

// Mono slider: a 1 px hairline with a dot handle — no track, no chunky fill.
// It wraps a native <input type="range"> on purpose: arrows, Home/End and
// PageUp/PageDown keyboard support come from the platform rather than from a
// re-implementation, and screen readers get a real slider role. Only the
// appearance is overridden, through the vendor thumb/track pseudo-elements.
const props = withDefaults(
  defineProps<{
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    /** Accessible name; features pass a translated string. */
    label: string;
    /**
     * `fill` draws the line up to the handle (a magnitude, e.g. sidetone),
     * `center` marks the middle instead (a balance, e.g. chatmix).
     */
    variant?: "fill" | "center";
  }>(),
  { step: 1, variant: "fill" },
);

const emit = defineEmits<{ "update:modelValue": [value: number] }>();

const fillWidth = computed(() => {
  const span = props.max - props.min;
  // A degenerate range would divide by zero; there is nothing to fill then.
  const ratio = span === 0 ? 0 : (props.modelValue - props.min) / span;
  return `${ratio * 100}%`;
});
</script>

<template>
  <div class="group relative flex h-7 items-center">
    <span
      v-if="variant === 'fill'"
      data-part="fill"
      class="pointer-events-none absolute top-1/2 left-0 -mt-px h-px bg-ink transition-colors group-hover:bg-accent"
      :style="{ width: fillWidth }"
    />
    <span
      v-else
      data-part="center-tick"
      class="absolute top-1/2 left-1/2 -mt-[4.5px] h-[9px] w-px bg-low"
    />
    <span data-part="end" class="absolute top-1/2 left-0 -mt-[2.5px] h-[5px] w-px bg-low" />
    <span data-part="end" class="absolute top-1/2 right-0 -mt-[2.5px] h-[5px] w-px bg-low" />
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :aria-label="label"
      class="relative z-[2] h-7 w-full cursor-ew-resize appearance-none bg-transparent [&::-moz-range-thumb]:size-[11px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--color-ink)] hover:[&::-moz-range-thumb]:bg-[var(--color-accent)] focus-visible:[&::-moz-range-thumb]:bg-[var(--color-accent)] [&::-moz-range-track]:h-px [&::-moz-range-track]:bg-[var(--color-hair)] [&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-[var(--color-hair)] [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-[11px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-ink)] [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-125 hover:[&::-webkit-slider-thumb]:bg-[var(--color-accent)] focus-visible:[&::-webkit-slider-thumb]:bg-[var(--color-accent)] active:[&::-webkit-slider-thumb]:scale-125 active:[&::-webkit-slider-thumb]:bg-[var(--color-accent)]"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).valueAsNumber)"
    />
  </div>
</template>
