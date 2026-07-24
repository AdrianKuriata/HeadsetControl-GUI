<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import type { Unsubscribe } from "./core/backend";
import { createBackend } from "./core/create-backend";
import { probe, refreshDevices } from "./core/probe";
import { INITIAL_STATE, transition } from "./core/state-machine";
import type { AppEvent, AppState } from "./core/state-machine";
import { SCREENS, screenProps } from "./screens/registry";

// The state machine lives here (PROJECT.md §3.3): this component owns the
// current state and renders exactly one screen for it. Transitions are decided
// in core/state-machine.ts and the state → screen mapping is data in
// screens/registry.ts, so this file stays a shell.
const backend = createBackend();
const state = ref<AppState>(INITIAL_STATE);

const screen = computed(() => SCREENS[state.value.kind]);
const props = computed(() => screenProps(state.value));

function dispatch(event: AppEvent): void {
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

let unsubscribe: Unsubscribe | undefined;

onMounted(async () => {
  unsubscribe = await backend.onDevicesChanged(() => void onHotplug());
  await runProbe();
});

onUnmounted(() => unsubscribe?.());
</script>

<template>
  <!-- The app shell from the mock: a centred, fixed-width column. Document-level
       styling (tokens, focus ring, fonts) lives in src/styles/index.css. -->
  <main class="mx-auto flex h-full max-w-[1000px] flex-col px-12">
    <component :is="screen" v-bind="props" @retry="retry" />
  </main>
</template>
