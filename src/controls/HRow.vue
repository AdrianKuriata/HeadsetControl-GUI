<script setup lang="ts">
// The three-column row every feature is laid out in (from the mock): what it
// is, the control, the value it currently holds. Like every control it carries
// no copy of its own — the name and its explanatory line arrive translated.
defineProps<{
  name: string;
  /** The small grey line under the name; omitted when the name says it all. */
  description?: string;
}>();
</script>

<template>
  <div
    data-part="row"
    class="grid min-h-[76px] grid-cols-[190px_1fr_150px] items-center gap-9 border-b border-hair-soft last:border-hair"
  >
    <div class="text-[13.5px] font-medium tracking-[0.02em]">
      {{ name }}
      <small v-if="description" data-part="description" class="mt-0.5 block text-[11.5px] text-low">
        {{ description }}
      </small>
    </div>
    <div><slot /></div>
    <div class="text-right"><slot name="value" /></div>
  </div>
</template>
