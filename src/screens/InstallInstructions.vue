<script setup lang="ts">
import { useI18n } from "vue-i18n";

// Shell commands, not prose: they stay in script and render through
// interpolation, so they are never translated and never flagged as bare
// strings. Distribution names are proper nouns for the same reason.
//
// Every distribution gets the same *build from source* path on purpose: the
// Maxwell 2 support this app needs is newer than any tagged release, so a
// packaged `headsetcontrol` would install a binary that lands the user right
// back on the bad-version screen. The commands are upstream's own
// (Sapd/HeadsetControl README, PROJECT.md §9), only the dependencies differ.
const DEPENDENCIES = [
  {
    distribution: "Debian / Ubuntu",
    command: "sudo apt install build-essential git cmake libhidapi-dev",
  },
  { distribution: "Fedora", command: "sudo dnf install g++ git cmake hidapi-devel" },
  { distribution: "Arch Linux", command: "sudo pacman -S base-devel git cmake hidapi" },
];

const BUILD = `git clone https://github.com/Sapd/HeadsetControl && cd HeadsetControl
mkdir build && cd build
cmake .. && make
sudo make install`;

const { t } = useI18n({ useScope: "global" });
</script>

<template>
  <div class="flex flex-col gap-3" data-part="install-instructions">
    <h2 class="font-mono text-[11.5px] tracking-[0.08em] text-ink uppercase">
      {{ t("install.dependencies") }}
    </h2>
    <dl class="flex flex-col gap-2">
      <template v-for="entry in DEPENDENCIES" :key="entry.distribution">
        <dt class="font-mono text-[11.5px] tracking-[0.08em] text-mid uppercase">
          {{ entry.distribution }}
        </dt>
        <dd>
          <pre
            class="overflow-x-auto border border-hair p-3 font-mono text-[11.5px] text-mid select-text"
          ><code>{{ entry.command }}</code></pre>
        </dd>
      </template>
    </dl>

    <h2 class="mt-1 font-mono text-[11.5px] tracking-[0.08em] text-ink uppercase">
      {{ t("install.build") }}
    </h2>
    <pre
      class="overflow-x-auto border border-hair p-3 font-mono text-[11.5px] text-mid select-text"
    ><code>{{ BUILD }}</code></pre>
    <p class="max-w-[62ch] text-mid">{{ t("install.udev") }}</p>
  </div>
</template>
