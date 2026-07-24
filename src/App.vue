<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import HToast from "./controls/HToast.vue";
import type { Unsubscribe } from "./core/backend";
import { createBackend } from "./core/create-backend";
import { probe, refreshDevices } from "./core/probe";
import { startRefreshLoop } from "./core/refresh";
import type { RefreshLoop } from "./core/refresh";
import { INITIAL_STATE, transition } from "./core/state-machine";
import type { AppEvent, AppState } from "./core/state-machine";
import { useDeviceStore } from "./core/stores/device";
import { useDevicesStore } from "./core/stores/devices";
import { SCREENS, screenProps } from "./screens/registry";

// The state machine lives here (PROJECT.md §3.3): this component owns the
// current state and renders exactly one screen for it. Transitions are decided
// in core/state-machine.ts, the state → screen mapping is data in
// screens/registry.ts, and the values live in the stores — so this file stays a
// shell that wires them together.
const backend = createBackend();
const devices = useDevicesStore();
const device = useDeviceStore();
const state = ref<AppState>(INITIAL_STATE);

const { t } = useI18n({ useScope: "global" });

const screen = computed(() => SCREENS[state.value.kind]);
const props = computed(() => screenProps(state.value, device.readings));

function dispatch(event: AppEvent): void {
  if (event.kind === "probe-succeeded" || event.kind === "devices-changed") {
    devices.apply(event.devices);
  }

  state.value = transition(state.value, event);
}

async function runProbe(): Promise<void> {
  dispatch(await probe(backend));
}

async function retry(): Promise<void> {
  dispatch({ kind: "retry" });
  await runProbe();
}

async function onHotplug(): Promise<void> {
  // Only the device list — a plugged headset is no reason to re-check the
  // binary. A failed read reports nothing and leaves the screen alone, so a
  // backend that starts failing mid-session cannot turn a hotplug event into
  // an unhandled rejection.
  const event = await refreshDevices(backend);
  if (event) {
    dispatch(event);
  }
}

// The device store follows the screen: it holds the values of the headset the
// user is looking at, and starts over for any other one.
watch(
  () => (state.value.kind === "ready" ? state.value.device.id : null),
  (deviceId) => {
    device.focus(deviceId);
    if (deviceId !== null) {
      void device.refresh(backend);
    }
  },
);

let unsubscribe: Unsubscribe | undefined;
let refresh: RefreshLoop | undefined;

onMounted(async () => {
  unsubscribe = await backend.onDevicesChanged(() => void onHotplug());
  // Live values are polled, not pushed: nothing tells the app that the battery
  // dropped a percent (#10).
  refresh = startRefreshLoop(() => void device.refresh(backend));
  await runProbe();
});

onUnmounted(() => {
  unsubscribe?.();
  refresh?.stop();
});
</script>

<template>
  <!-- The app shell from the mock: a centred, fixed-width column. Document-level
       styling (tokens, focus ring, fonts) lives in src/styles/index.css. -->
  <main class="mx-auto flex h-full max-w-[1000px] flex-col px-12">
    <component :is="screen" v-bind="props" @retry="retry" />
    <!-- A refused write is reported here and nowhere else: the screen keeps
         showing the device, with the value already rolled back (#11). -->
    <HToast
      v-if="device.failure"
      class="mb-6"
      :dismiss-label="t('common.dismiss')"
      @dismiss="device.dismiss()"
      >{{ t("toast.writeFailed", { capability: device.failure.capability }) }}</HToast
    >
  </main>
</template>
