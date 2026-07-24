<script setup lang="ts">
// A discreet strip at the bottom of the window: what the headset refused, and a
// way to acknowledge it (PROJECT.md §3.3). Like every control it carries no
// copy of its own — the message arrives through the slot, the button's label as
// a prop, both already translated by the caller.
defineProps<{
  /** Accessible and visible name of the acknowledge button. */
  dismissLabel: string;
}>();

defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div
    role="status"
    data-part="toast"
    class="flex items-center justify-between gap-6 border border-hair bg-[var(--color-bg)] px-4 py-3 text-[12.5px] text-ink"
  >
    <span data-part="message"><slot /></span>
    <button
      type="button"
      data-part="dismiss"
      class="cursor-pointer font-mono text-[10px] tracking-[0.24em] text-low uppercase transition-colors hover:text-[var(--color-accent)]"
      @click="$emit('dismiss')"
    >
      {{ dismissLabel }}
    </button>
  </div>
</template>
