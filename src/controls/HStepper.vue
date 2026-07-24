<script setup lang="ts">
// Bare − / + around a value. The stepper deliberately knows nothing about the
// scale it walks: it emits a direction and the feature decides what the next
// value is (auto-off, for instance, steps through a fixed list of minutes, not
// an arithmetic range). The rendered value comes in through the default slot,
// already formatted and translated.
defineProps<{
  /** Accessible names for the two buttons; features pass translated strings. */
  decrementLabel: string;
  incrementLabel: string;
  atMin?: boolean;
  atMax?: boolean;
}>();

defineEmits<{ step: [direction: -1 | 1] }>();
</script>

<template>
  <div class="flex items-center gap-[18px]">
    <button
      type="button"
      :aria-label="decrementLabel"
      :disabled="atMin"
      class="size-5 cursor-pointer font-mono text-sm leading-none text-low transition-colors not-disabled:hover:text-[var(--color-accent)] disabled:cursor-default disabled:opacity-40"
      @click="$emit('step', -1)"
    >
      −
    </button>
    <span data-part="value" class="min-w-[70px] text-center font-mono text-[12.5px] tabular-nums">
      <slot />
    </span>
    <button
      type="button"
      :aria-label="incrementLabel"
      :disabled="atMax"
      class="size-5 cursor-pointer font-mono text-sm leading-none text-low transition-colors not-disabled:hover:text-[var(--color-accent)] disabled:cursor-default disabled:opacity-40"
      @click="$emit('step', 1)"
    >
      +
    </button>
  </div>
</template>
