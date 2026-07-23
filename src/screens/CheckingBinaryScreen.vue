<script setup lang="ts">
import { useI18n } from "vue-i18n";

// Startup probe. The Mono design system (#6) replaces this placeholder markup.
const { t } = useI18n({ useScope: "global" });
</script>

<template>
  <section class="screen" aria-busy="true">
    <h1>{{ t("screens.checking.title") }}</h1>
    <p>{{ t("screens.checking.body") }}</p>
  </section>
</template>
