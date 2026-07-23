<script setup lang="ts">
import type { Device } from "../core/types.gen";

// One placeholder row per reported capability. The capability → component map
// (#12) replaces this; rendering the raw identifier is what keeps an unknown
// capability harmless in the meantime.
defineProps<{ device: Device }>();
</script>

<template>
  <section class="screen">
    <h1>{{ device.name }}</h1>
    <p>{{ device.product }}</p>
    <ul>
      <li v-for="capability in device.capabilities" :key="capability">{{ capability }}</li>
    </ul>
  </section>
</template>
