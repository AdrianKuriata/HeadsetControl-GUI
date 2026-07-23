<script setup lang="ts">
import type { Device } from "../core/types.gen";

// The device vanished: its last known values stay on screen, dimmed. The app
// returns to `ready` on its own when the headset comes back.
defineProps<{ device: Device }>();
</script>

<template>
  <section class="screen screen--dimmed">
    <h1>{{ device.name }}</h1>
    <p>Connection lost — waiting for the headset to come back.</p>
    <ul>
      <li v-for="capability in device.capabilities" :key="capability">{{ capability }}</li>
    </ul>
  </section>
</template>
