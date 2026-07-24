<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });

defineProps<{ found: string; required: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="flex h-full flex-col justify-center gap-3 py-10">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">
      {{ t("screens.badVersion.title") }}
    </h1>
    <p class="max-w-[62ch] text-mid">{{ t("screens.badVersion.body", { found, required }) }}</p>
    <button
      type="button"
      class="mt-2 w-fit cursor-pointer border-b border-transparent py-1 font-mono text-[11.5px] tracking-[0.08em] text-low uppercase transition-colors hover:border-b-accent hover:text-ink"
      @click="$emit('retry')"
    >
      {{ t("common.checkAgain") }}
    </button>
  </section>
</template>
