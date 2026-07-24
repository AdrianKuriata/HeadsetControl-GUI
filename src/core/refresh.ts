/**
 * How often live values (battery, chatmix) are re-read while the app is on
 * screen — PROJECT.md §3.1. Every tick costs one `headsetcontrol` call, and a
 * battery percentage does not move faster than this.
 */
export const REFRESH_INTERVAL_MS = 5_000;

/** A running refresh loop. */
export interface RefreshLoop {
  /** Stops ticking and forgets the window. Always call it on teardown. */
  stop(): void;
}

/**
 * Ticks every {@link REFRESH_INTERVAL_MS} for as long as the window is on
 * screen, and not at all while it is hidden.
 *
 * Hotplug is an event (`devices-changed`, #10); values are not — nothing tells
 * the app that the battery dropped a percent, so they are polled. Pausing while
 * hidden is what keeps a minimised app from spawning a process every few
 * seconds; the tray (M3) reuses this loop with its own cadence.
 *
 * Visibility, not focus: a window sitting behind another one is still being
 * looked at.
 */
export function startRefreshLoop(
  tick: () => void,
  intervalMs: number = REFRESH_INTERVAL_MS,
): RefreshLoop {
  let timer: ReturnType<typeof setInterval> | undefined;

  function resume(): void {
    if (timer === undefined) {
      timer = setInterval(tick, intervalMs);
    }
  }

  function pause(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
      pause();
      return;
    }

    // Coming back, the values on screen are as old as the app was away: read
    // once immediately instead of showing a stale battery for another interval.
    tick();
    resume();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);

  if (document.visibilityState !== "hidden") {
    resume();
  }

  return {
    stop() {
      pause();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
