<script setup lang="ts">
import { useI18n } from "vue-i18n";

import type { Device } from "../core/types.gen";

// One placeholder row per reported capability. The capability → component map
// (#12) replaces this; rendering the raw identifier is what keeps an unknown
// capability harmless in the meantime. Device name/product and the capability
// identifiers are data, not translatable copy.
const { t } = useI18n({ useScope: "global" });

defineProps<{ device: Device }>();
</script>

<template>
  <section class="screen">
    <h1>{{ device.name }}</h1>
    <p>{{ device.product }}</p>
    <h2>{{ t("screens.ready.capabilities") }}</h2>
    <ul>
      <li v-for="capability in device.capabilities" :key="capability">{{ capability }}</li>
    </ul>
  </section>
</template>
