<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });

defineProps<{ found: string; required: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="screen">
    <h1>{{ t("screens.badVersion.title") }}</h1>
    <p>{{ t("screens.badVersion.body", { found, required }) }}</p>
    <button type="button" @click="$emit('retry')">{{ t("common.checkAgain") }}</button>
  </section>
</template>
