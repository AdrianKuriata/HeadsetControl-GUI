<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { I18nT } from "vue-i18n";

// The name of the CLI this app wraps — a proper noun, interpolated so it stays
// out of the translated sentence and out of the no-bare-strings lint.
const TOOL = "headsetcontrol";

const { t } = useI18n({ useScope: "global" });

defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="screen">
    <h1>{{ t("screens.missingBinary.title") }}</h1>
    <I18nT keypath="screens.missingBinary.body" tag="p" scope="global">
      <template #tool
        ><code>{{ TOOL }}</code></template
      >
    </I18nT>
    <button type="button" @click="$emit('retry')">{{ t("common.checkAgain") }}</button>
  </section>
</template>
