<script setup lang="ts">
import { useI18n } from "vue-i18n";

import type { Device } from "../core/types.gen";

// The device vanished: its last known values stay on screen, dimmed. The app
// returns to `ready` on its own when the headset comes back.
const { t } = useI18n({ useScope: "global" });

defineProps<{ device: Device }>();
</script>

<template>
  <section class="flex h-full flex-col justify-center gap-3 py-10 opacity-50">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">{{ device.name }}</h1>
    <p class="max-w-[62ch] text-mid">{{ t("screens.deviceLost.body") }}</p>
    <ul class="flex flex-col gap-1 font-mono text-[11.5px] tracking-[0.08em] text-mid">
      <li v-for="capability in device.capabilities" :key="capability">{{ capability }}</li>
    </ul>
  </section>
</template>
