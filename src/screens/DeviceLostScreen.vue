<script setup lang="ts">
import { useI18n } from "vue-i18n";

import type { Device } from "../core/types.gen";

// The device vanished: its last known values stay on screen, dimmed. The app
// returns to `ready` on its own when the headset comes back.
const { t } = useI18n({ useScope: "global" });

defineProps<{ device: Device }>();
</script>

<template>
  <section class="screen screen--dimmed">
    <h1>{{ device.name }}</h1>
    <p>{{ t("screens.deviceLost.body") }}</p>
    <ul>
      <li v-for="capability in device.capabilities" :key="capability">{{ capability }}</li>
    </ul>
  </section>
</template>
