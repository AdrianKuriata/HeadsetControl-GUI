<script setup lang="ts">
import { useSlots } from "vue";

// The value column of a control row: mono font, tabular digits so numbers do
// not jitter while a slider moves. Formatting (units, "off", translations) is
// the caller's job — this control only presents what it is handed.
const slots = useSlots();
</script>

<template>
  <span class="text-right font-mono text-[12.5px] text-ink tabular-nums">
    <slot />
    <small v-if="slots.suffix" data-part="suffix" class="text-[length:inherit] text-low">
      <slot name="suffix" />
    </small>
  </span>
</template>
