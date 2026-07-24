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
  <section class="flex h-full flex-col justify-center gap-3 py-10">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">
      {{ t("screens.missingBinary.title") }}
    </h1>
    <I18nT
      keypath="screens.missingBinary.body"
      tag="p"
      scope="global"
      class="max-w-[62ch] text-mid"
    >
      <template #tool
        ><code class="font-mono text-ink">{{ TOOL }}</code></template
      >
    </I18nT>
    <button
      type="button"
      class="mt-2 w-fit cursor-pointer border-b border-transparent py-1 font-mono text-[11.5px] tracking-[0.08em] text-mid uppercase transition-colors hover:border-b-accent hover:text-ink"
      @click="$emit('retry')"
    >
      {{ t("common.checkAgain") }}
    </button>
  </section>
</template>
