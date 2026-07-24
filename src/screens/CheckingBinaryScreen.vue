<script setup lang="ts">
import { useI18n } from "vue-i18n";

// Startup probe. The Mono design system (#6) replaces this placeholder markup.
const { t } = useI18n({ useScope: "global" });
</script>

<template>
  <section class="flex h-full flex-col justify-center gap-3 py-10" aria-busy="true">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">
      {{ t("screens.checking.title") }}
    </h1>
    <p class="max-w-[62ch] text-mid">{{ t("screens.checking.body") }}</p>
  </section>
</template>
