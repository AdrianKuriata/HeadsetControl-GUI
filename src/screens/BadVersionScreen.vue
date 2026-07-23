<script setup lang="ts">
defineProps<{ found: string; required: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="screen">
    <h1>headsetcontrol is too old</h1>
    <p>
      Found version <strong>{{ found }}</strong
      >, this app needs <strong>{{ required }}</strong> or newer.
    </p>
    <button type="button" @click="$emit('retry')">Check again</button>
  </section>
</template>
