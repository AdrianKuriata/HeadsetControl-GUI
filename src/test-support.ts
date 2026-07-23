import { mount } from "@vue/test-utils";
import type { ComponentMountingOptions } from "@vue/test-utils";
import type { Component } from "vue";

import { createAppI18n } from "./i18n";
import type { Locale } from "./i18n";

/**
 * Mounts a component with vue-i18n installed. Every screen calls `useI18n()`, so
 * mounting one without the plugin throws — all component tests go through here.
 * The locale defaults to `en` so assertions can stay on the English copy; pass a
 * locale (or reach the returned i18n) to test switching.
 */
export function mountWithI18n<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> = {},
  locale: Locale = "en",
) {
  const i18n = createAppI18n(locale);
  const wrapper = mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [...(options.global?.plugins ?? []), i18n],
    },
  });
  return { wrapper, i18n };
}
