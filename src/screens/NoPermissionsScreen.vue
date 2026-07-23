<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { I18nT } from "vue-i18n";

// Technical constants, not prose: kept in script so they render via
// interpolation (untranslated, and not flagged by no-bare-strings). The rule is
// generic until binary detection (#9) can name the connected device's vendor id.
const RULE_PATH = "/etc/udev/rules.d/70-headsets.rules";
const RELOAD_COMMAND = "sudo udevadm control --reload-rules && sudo udevadm trigger";
const UDEV_RULE = 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", TAG+="uaccess"';

const { t } = useI18n({ useScope: "global" });

defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="screen">
    <h1>{{ t("screens.noPermissions.title") }}</h1>
    <I18nT keypath="screens.noPermissions.body" tag="p" scope="global">
      <template #path
        ><code>{{ RULE_PATH }}</code></template
      >
      <template #command
        ><code>{{ RELOAD_COMMAND }}</code></template
      >
    </I18nT>
    <pre><code>{{ UDEV_RULE }}</code></pre>
    <button type="button" @click="$emit('retry')">{{ t("common.checkAgain") }}</button>
  </section>
</template>
