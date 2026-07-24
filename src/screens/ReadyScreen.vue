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
  <section class="flex h-full flex-col justify-center gap-3 py-10">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">{{ device.name }}</h1>
    <p class="max-w-[62ch] text-mid">{{ device.product }}</p>
    <h2 class="font-mono text-[10px] tracking-[0.24em] text-low uppercase">
      {{ t("screens.ready.capabilities") }}
    </h2>
    <ul class="flex flex-col gap-1 font-mono text-[11.5px] tracking-[0.08em] text-mid">
      <li v-for="capability in device.capabilities" :key="capability">{{ capability }}</li>
    </ul>
  </section>
</template>
