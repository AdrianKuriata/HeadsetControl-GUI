import { mount } from "@vue/test-utils";
import type { ComponentMountingOptions } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { Component } from "vue";

import { createAppI18n } from "./i18n";
import type { Locale } from "./i18n";

/**
 * Mounts a component with vue-i18n and a fresh Pinia installed. Every screen
 * calls `useI18n()` and anything below `App.vue` may reach a store, so mounting
 * without the plugins throws — all component tests go through here. The Pinia
 * is also made active, so a test can reach the very stores the component uses
 * (`useDeviceStore()`) to script or inspect them.
 *
 * The locale defaults to `en` so assertions can stay on the English copy; pass a
 * locale (or reach the returned i18n) to test switching.
 */
export function mountWithI18n<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> = {},
  locale: Locale = "en",
) {
  const i18n = createAppI18n(locale);
  const pinia = createPinia();
  setActivePinia(pinia);

  const wrapper = mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [...(options.global?.plugins ?? []), i18n, pinia],
    },
  });
  return { wrapper, i18n, pinia };
}

/**
 * The element at `index`, or a failed test saying it was not there.
 *
 * `noUncheckedIndexedAccess` types every array index as possibly `undefined`,
 * which is right — `findAll()` really can come back short. Assertions would
 * otherwise be written with `!`, and that turns a selector that stopped matching
 * into `Cannot read properties of undefined` instead of a named failure.
 */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];

  if (item === undefined) {
    throw new Error(`expected an element at index ${index}, found ${items.length}`);
  }

  return item;
}
