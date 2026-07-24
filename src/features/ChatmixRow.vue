<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import HReadout from "../controls/HReadout.vue";
import HRow from "../controls/HRow.vue";
import type { FeatureProps } from "./contract";

// Chatmix is reported, never written: `headsetcontrol -m` answers 0-128 with 64
// as the balanced point, and there is no flag to set it — the dial is on the
// headset. The row therefore only shows which way the balance leans.
const BALANCED = 64;
const FULL = 100;

const props = defineProps<FeatureProps>();
const { t } = useI18n({ useScope: "global" });

const chatmix = computed(() => props.readings?.chatmix ?? null);

/** Where the balance sits along the row, as a percentage of the full range. */
const position = computed(() =>
  chatmix.value === null ? null : `${(chatmix.value / (2 * BALANCED)) * 100}%`,
);

/** Each side at full until the balance passes the middle, then fading. */
const share = computed(() => {
  const value = chatmix.value;
  if (value === null) return null;

  return {
    game: value <= BALANCED ? FULL : Math.round(((2 * BALANCED - value) / BALANCED) * FULL),
    chat: value >= BALANCED ? FULL : Math.round((value / BALANCED) * FULL),
  };
});
</script>

<template>
  <HRow :name="t('features.chatmix.name')" :description="t('features.chatmix.description')">
    <div class="flex flex-col gap-2">
      <!-- Read-only: the same hairline the sliders use, with a marker where the
           balance sits. There is no control because there is nothing to write. -->
      <div class="relative h-[9px]" data-part="meter">
        <span class="absolute top-1/2 left-0 h-px w-full bg-hair" />
        <span class="absolute top-1/2 left-1/2 -mt-[4.5px] h-[9px] w-px bg-low" />
        <span
          v-if="position"
          data-part="marker"
          class="absolute top-1/2 -mt-[3px] -ml-[3px] size-[6px] rounded-full bg-ink"
          :style="{ left: position }"
        />
      </div>
      <div class="flex justify-between font-mono text-[10px] tracking-[0.24em] text-low uppercase">
        <span>{{ t("features.chatmix.game") }}</span>
        <span>{{ t("features.chatmix.chat") }}</span>
      </div>
    </div>
    <template #value>
      <HReadout>
        <span data-part="balance">{{
          share ? `${share.game} / ${share.chat}` : t("features.unknown")
        }}</span>
      </HReadout>
    </template>
  </HRow>
</template>
