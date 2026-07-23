<script setup lang="ts">
import { useI18n } from "vue-i18n";

// headsetcontrol works, nothing supported is plugged in. Hotplug moves the app
// to `ready` by itself — no retry button here on purpose.
const { t } = useI18n({ useScope: "global" });
</script>

<template>
  <section class="screen">
    <h1>{{ t("screens.noDevice.title") }}</h1>
    <p>{{ t("screens.noDevice.body") }}</p>
  </section>
</template>
