<script setup lang="ts">
import { useI18n } from "vue-i18n";

// headsetcontrol works, nothing supported is plugged in. Hotplug moves the app
// to `ready` by itself — no retry button here on purpose.
const { t } = useI18n({ useScope: "global" });
</script>

<template>
  <section class="flex h-full flex-col justify-center gap-3 py-10">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">
      {{ t("screens.noDevice.title") }}
    </h1>
    <p class="max-w-[62ch] text-mid">{{ t("screens.noDevice.body") }}</p>
  </section>
</template>
