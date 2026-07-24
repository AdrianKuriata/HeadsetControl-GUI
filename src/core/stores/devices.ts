import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { Device } from "../types.gen";

/**
 * What is plugged in, and which one the user is looking at.
 *
 * The list arrives from the startup probe and from hotplug events; App.vue owns
 * those subscriptions (a Pinia store has no unmount hook to tear them down) and
 * feeds this store with {@link DevicesStore.apply}.
 *
 * Selection is kept as an **id**, not as a device object: a headset that is
 * unplugged and plugged back in is a new object with the same id, and the user
 * expects to still be looking at it (PROJECT.md §3.2).
 */
export const useDevicesStore = defineStore("devices", () => {
  const devices = ref<Device[]>([]);
  const selectedId = ref<string | null>(null);

  /**
   * The device the UI is about: the selected one while it is connected, the
   * first connected one otherwise. `undefined` when nothing is connected.
   */
  const selected = computed(
    () => devices.value.find((device) => device.id === selectedId.value) ?? devices.value[0],
  );

  /** Whether the user has more than one headset to choose between. */
  const hasChoice = computed(() => devices.value.length > 1);

  /**
   * A fresh listing — from the probe or a hotplug event. The selected id is
   * kept even when its device is not in the list: it comes back selected.
   */
  function apply(listed: Device[]): void {
    devices.value = listed;
  }

  /** The device picker's action. Ignores an id nothing answers to. */
  function select(id: string): void {
    if (devices.value.some((device) => device.id === id)) {
      selectedId.value = id;
    }
  }

  return { devices, selectedId, selected, hasChoice, apply, select };
});

export type DevicesStore = ReturnType<typeof useDevicesStore>;
