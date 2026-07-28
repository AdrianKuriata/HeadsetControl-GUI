import type { Platform } from "../profiles/types";

/** The attribute the accent variables are scoped to (`src/styles/index.css`). */
export const PLATFORM_ATTRIBUTE = "data-platform";

/**
 * Themes the app for the connected headset's platform.
 *
 * The whole mechanism is this one attribute: every `*-accent` utility compiles
 * to `var(--color-accent)`, and the stylesheet re-points that variable under a
 * `[data-platform]` scope. Which is why no component ever names a platform
 * (PROJECT.md §2, ADR 0008).
 *
 * `null` — no profile, or a product id the profile does not map — removes the
 * attribute and leaves the neutral white accent in place.
 */
export function applyPlatform(
  platform: Platform | null,
  root: HTMLElement = document.documentElement,
): void {
  if (platform === null) {
    root.removeAttribute(PLATFORM_ATTRIBUTE);
    return;
  }

  root.setAttribute(PLATFORM_ATTRIBUTE, platform);
}
