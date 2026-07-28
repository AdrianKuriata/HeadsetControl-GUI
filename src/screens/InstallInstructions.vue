<script setup lang="ts">
import { useI18n } from "vue-i18n";

// Shell commands, not prose: they stay in script and render through
// interpolation, so they are never translated and never flagged as bare
// strings. Distribution and format names are proper nouns for the same reason.
//
// Since 4.0.0 upstream ships signed packages for every format below, so that is
// the route offered first — until then no release worked with a Maxwell 2 at all
// and a source build was the only honest instruction.
// Shown as selectable text, never as an `<a href>`. The capability set carries no
// `opener` permission and no navigation allowlist, so an anchor would navigate the
// app window itself out of the bundle — the same reason the udev rules on the
// no-permissions screen are copyable text rather than a link.
const RELEASES = "https://github.com/Sapd/HeadsetControl/releases/latest";

// Every release asset has a detached signature next to it, published under
// upstream's own key. Checking it is one command, and this app tells a user to
// install a binary that will then talk to their hardware.
const VERIFY = `gpg --verify headsetcontrol_*_amd64.deb.asc`;

// No version in any command on purpose: the release link always resolves to the
// newest, and the globs keep matching whatever it produced. A pinned number here
// would be wrong the day upstream tags again.
const PACKAGES = [
  { format: "Debian / Ubuntu", command: "sudo apt install ./headsetcontrol_*_amd64.deb" },
  { format: "Fedora / RHEL", command: "sudo dnf install ./headsetcontrol-*.x86_64.rpm" },
  { format: "AppImage", command: "chmod +x headsetcontrol-x86_64.AppImage" },
];

// Kept as the fallback rather than dropped: upstream packages nothing for Arch,
// and building from git is still how anyone runs a version newer than the tag.
// The commands are upstream's own (Sapd/HeadsetControl README, PROJECT.md §9).
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
      {{ t("install.packages") }}
    </h2>
    <pre
      class="overflow-x-auto border border-hair p-3 font-mono text-[11.5px] text-mid select-text"
    ><code>{{ RELEASES }}</code></pre>

    <h3 class="mt-1 font-mono text-[11.5px] tracking-[0.08em] text-mid uppercase">
      {{ t("install.verify") }}
    </h3>
    <pre
      class="overflow-x-auto border border-hair p-3 font-mono text-[11.5px] text-mid select-text"
    ><code>{{ VERIFY }}</code></pre>

    <dl class="flex flex-col gap-2">
      <template v-for="entry in PACKAGES" :key="entry.format">
        <dt class="font-mono text-[11.5px] tracking-[0.08em] text-mid uppercase">
          {{ entry.format }}
        </dt>
        <dd>
          <pre
            class="overflow-x-auto border border-hair p-3 font-mono text-[11.5px] text-mid select-text"
          ><code>{{ entry.command }}</code></pre>
        </dd>
      </template>
    </dl>
    <p class="max-w-[62ch] text-mid">{{ t("install.udev") }}</p>

    <h2 class="mt-4 font-mono text-[11.5px] tracking-[0.08em] text-ink uppercase">
      {{ t("install.source") }}
    </h2>
    <h3 class="font-mono text-[11.5px] tracking-[0.08em] text-mid uppercase">
      {{ t("install.dependencies") }}
    </h3>
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

    <h3 class="mt-1 font-mono text-[11.5px] tracking-[0.08em] text-mid uppercase">
      {{ t("install.build") }}
    </h3>
    <pre
      class="overflow-x-auto border border-hair p-3 font-mono text-[11.5px] text-mid select-text"
    ><code>{{ BUILD }}</code></pre>
  </div>
</template>
