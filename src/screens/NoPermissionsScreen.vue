<script setup lang="ts">
// The rule is generic until binary detection (#9) can name the connected
// device's vendor id.
const UDEV_RULE = 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", TAG+="uaccess"';

defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="screen">
    <h1>No permission to reach the headset</h1>
    <p>
      Save this rule as <code>/etc/udev/rules.d/70-headsets.rules</code>, reload the rules (<code
        >sudo udevadm control --reload-rules &amp;&amp; sudo udevadm trigger</code
      >), then reconnect the headset.
    </p>
    <pre><code>{{ UDEV_RULE }}</code></pre>
    <button type="button" @click="$emit('retry')">Check again</button>
  </section>
</template>
