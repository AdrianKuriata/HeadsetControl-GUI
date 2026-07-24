<script setup lang="ts" generic="T extends string | number | boolean">
import { computed, ref } from "vue";

// Mono option row: plain text, the active one underlined in the accent colour.
// ARIA-wise this is a radiogroup, which pins the keyboard contract: the group
// is a *single* tab stop (roving tabindex) and arrows/Home/End move the
// selection inside it — tabbing through every option would be wrong.
const props = defineProps<{
  modelValue: T;
  options: readonly { value: T; label: string }[];
  /** Accessible name for the group; features pass a translated string. */
  label: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: T] }>();

const items = ref<HTMLElement[]>([]);

/** -1 (nothing matches) falls back to the first option, so a tab stop always exists. */
const selected = computed(() => props.options.findIndex((o) => o.value === props.modelValue));
const focusIndex = computed(() => Math.max(selected.value, 0));

function select(index: number): void {
  if (index === selected.value) return;
  emit("update:modelValue", props.options[index].value);
}

const MOVES: Record<string, (current: number, last: number) => number> = {
  ArrowRight: (c, last) => (c === last ? 0 : c + 1),
  ArrowDown: (c, last) => (c === last ? 0 : c + 1),
  ArrowLeft: (c, last) => (c === 0 ? last : c - 1),
  ArrowUp: (c, last) => (c === 0 ? last : c - 1),
  Home: () => 0,
  End: (_c, last) => last,
};

function onKeydown(event: KeyboardEvent): void {
  const move = MOVES[event.key];
  if (!move) return;
  event.preventDefault();

  const next = move(focusIndex.value, props.options.length - 1);
  select(next);
  items.value[next]?.focus();
}
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="flex gap-[26px]">
    <button
      v-for="(option, index) in options"
      :key="String(option.value)"
      :ref="(el) => (items[index] = el as HTMLElement)"
      type="button"
      role="radio"
      :aria-checked="index === selected"
      :tabindex="index === focusIndex ? 0 : -1"
      class="cursor-pointer border-b border-transparent py-1 font-mono text-[11.5px] tracking-[0.08em] text-low transition-colors hover:text-mid aria-checked:border-b-accent aria-checked:text-ink"
      @click="select(index)"
      @keydown="onKeydown"
    >
      {{ option.label }}
    </button>
  </div>
</template>
