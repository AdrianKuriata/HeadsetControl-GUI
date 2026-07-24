<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import InstallInstructions from "./InstallInstructions.vue";

const { t } = useI18n({ useScope: "global" });

const props = defineProps<{ found: string | null; required: string }>();
defineEmits<{ retry: [] }>();

// A binary too incompatible to name its own version gets a sentence that does
// not pretend to know one — never an invented "unknown" version number.
const body = computed(() =>
  props.found === null
    ? t("screens.badVersion.bodyUnnamed", { required: props.required })
    : t("screens.badVersion.body", { found: props.found, required: props.required }),
);
</script>

<template>
  <section class="flex h-full flex-col justify-center gap-3 py-10">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">
      {{ t("screens.badVersion.title") }}
    </h1>
    <p class="max-w-[62ch] text-mid" data-part="body">{{ body }}</p>
    <InstallInstructions />
    <button
      type="button"
      class="mt-2 w-fit cursor-pointer border-b border-transparent py-1 font-mono text-[11.5px] tracking-[0.08em] text-mid uppercase transition-colors hover:border-b-accent hover:text-ink"
      @click="$emit('retry')"
    >
      {{ t("common.checkAgain") }}
    </button>
  </section>
</template>
