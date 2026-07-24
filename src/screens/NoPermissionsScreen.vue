<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { I18nT } from "vue-i18n";

// Technical constants, not prose: kept in script so they render via
// interpolation (untranslated, and not flagged by no-bare-strings).
//
// The rules come from `headsetcontrol -u` rather than from a hand-written
// `hidraw*` catch-all: the CLI generates a rule per supported device, which
// grants this app exactly the access it needs instead of every HID device on
// the machine. Header text goes to stderr, so the pipe writes only rules
// (PROJECT.md §9).
const RULE_PATH = "/etc/udev/rules.d/70-headsets.rules";
const COMMANDS = `headsetcontrol -u | sudo tee ${RULE_PATH}
sudo udevadm control --reload-rules && sudo udevadm trigger`;

const { t } = useI18n({ useScope: "global" });

defineEmits<{ retry: [] }>();
</script>

<template>
  <section class="flex h-full flex-col justify-center gap-3 py-10">
    <h1 class="text-[15px] font-semibold tracking-[0.22em] uppercase">
      {{ t("screens.noPermissions.title") }}
    </h1>
    <I18nT
      keypath="screens.noPermissions.body"
      tag="p"
      scope="global"
      class="max-w-[62ch] text-mid"
    >
      <template #path
        ><code class="font-mono text-ink">{{ RULE_PATH }}</code></template
      >
    </I18nT>
    <pre
      class="overflow-x-auto border border-hair p-3 font-mono text-[11.5px] text-mid select-text"
      data-part="udev-rule"
    ><code>{{ COMMANDS }}</code></pre>
    <p class="max-w-[62ch] text-mid">{{ t("screens.noPermissions.reconnect") }}</p>
    <button
      type="button"
      class="mt-2 w-fit cursor-pointer border-b border-transparent py-1 font-mono text-[11.5px] tracking-[0.08em] text-mid uppercase transition-colors hover:border-b-accent hover:text-ink"
      @click="$emit('retry')"
    >
      {{ t("common.checkAgain") }}
    </button>
  </section>
</template>
