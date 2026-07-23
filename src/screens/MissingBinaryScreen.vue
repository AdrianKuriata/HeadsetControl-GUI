<script setup lang="ts">
defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="screen">
    <h1>headsetcontrol not found</h1>
    <p>
      This app is a GUI over the
      <code>headsetcontrol</code> command-line tool. Install it, then check again. Per-distribution
      instructions arrive with binary detection (#9).
    </p>
    <button type="button" @click="$emit('retry')">Check again</button>
  </section>
</template>
