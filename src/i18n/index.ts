import { createI18n } from "vue-i18n";

import { en, pl } from "./messages";

export const SUPPORTED_LOCALES = ["en", "pl"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** English is the fallback: any key missing from another locale resolves here. */
export const FALLBACK_LOCALE: Locale = "en";

/**
 * Picks a supported locale from a BCP-47 tag (`pl`, `pl-PL`, `en-US`, …),
 * falling back to English for anything unknown. Pure, so it is trivially tested.
 */
export function resolveLocale(candidate: string | undefined | null): Locale {
  const base = candidate?.toLowerCase().split("-")[0];
  return SUPPORTED_LOCALES.find((locale) => locale === base) ?? FALLBACK_LOCALE;
}

/** The system locale, resolved to one we support. */
export function detectLocale(): Locale {
  const system = typeof navigator === "undefined" ? undefined : navigator.language;
  return resolveLocale(system);
}

export function createAppI18n(locale: Locale = detectLocale()) {
  return createI18n({
    legacy: false, // Composition API — required for reactive live locale switching.
    locale,
    fallbackLocale: FALLBACK_LOCALE,
    messages: { en, pl },
  });
}

/** The app-wide instance. Tests build their own with {@link createAppI18n}. */
export const i18n = createAppI18n();

/** Switches the active locale; every `t()` re-renders (the settings UI, later). */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
}
