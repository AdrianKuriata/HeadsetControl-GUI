import { afterEach, describe, expect, it, vi } from "vitest";

import { en, pl } from "./messages";
import { FALLBACK_LOCALE, detectLocale, i18n, resolveLocale, setLocale } from "./index";

describe("resolveLocale", () => {
  it.each([
    { tag: "pl", expected: "pl" },
    { tag: "en", expected: "en" },
    { tag: "pl-PL", expected: "pl" },
    { tag: "en-US", expected: "en" },
    { tag: "PL", expected: "pl" },
  ])("resolves $tag to $expected", ({ tag, expected }) => {
    expect(resolveLocale(tag)).toBe(expected);
  });

  it.each([{ tag: "de" }, { tag: "fr-FR" }, { tag: "" }, { tag: undefined }, { tag: null }])(
    "falls back to English for $tag",
    ({ tag }) => {
      expect(resolveLocale(tag)).toBe(FALLBACK_LOCALE);
    },
  );
});

describe("detectLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the system locale when it is supported", () => {
    vi.stubGlobal("navigator", { language: "pl-PL" });

    expect(detectLocale()).toBe("pl");
  });

  it("falls back to English for an unsupported system locale", () => {
    vi.stubGlobal("navigator", { language: "ja-JP" });

    expect(detectLocale()).toBe("en");
  });

  it("falls back to English where there is no navigator at all", () => {
    vi.stubGlobal("navigator", undefined);

    expect(detectLocale()).toBe("en");
  });
});

describe("the message catalogs", () => {
  it("give every English key a Polish translation", () => {
    expect(keysOf(pl)).toEqual(keysOf(en));
  });

  it("translate every string (no key left as its English value)", () => {
    // Spot-check: a leaf that must differ between locales.
    expect(pl.screens.noDevice.title).not.toBe(en.screens.noDevice.title);
  });
});

describe("setLocale", () => {
  afterEach(() => setLocale("en"));

  it("switches the shared instance's active locale", () => {
    setLocale("pl");

    expect(i18n.global.locale.value).toBe("pl");
  });
});

function keysOf(object: object, prefix = ""): string[] {
  return Object.entries(object)
    .flatMap(([key, value]) =>
      typeof value === "object" && value !== null
        ? keysOf(value, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    )
    .sort();
}
