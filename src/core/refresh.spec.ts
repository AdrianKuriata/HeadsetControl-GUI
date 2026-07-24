import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REFRESH_INTERVAL_MS, startRefreshLoop } from "./refresh";

/** jsdom reports a visible document; tests drive it like a real window. */
function setVisibility(state: DocumentVisibilityState): void {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("startRefreshLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ticks on every interval while the window is on screen", () => {
    const tick = vi.fn();

    const loop = startRefreshLoop(tick);
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3);
    loop.stop();

    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("does not tick before the first interval is up", () => {
    const tick = vi.fn();

    const loop = startRefreshLoop(tick);
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS - 1);
    loop.stop();

    expect(tick).not.toHaveBeenCalled();
  });

  it("stops ticking while the window is hidden", () => {
    const tick = vi.fn();
    const loop = startRefreshLoop(tick);

    setVisibility("hidden");
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 4);
    loop.stop();

    expect(tick).not.toHaveBeenCalled();
  });

  it("reads once immediately when the window comes back", () => {
    const tick = vi.fn();
    const loop = startRefreshLoop(tick);

    setVisibility("hidden");
    setVisibility("visible");
    loop.stop();

    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("keeps a single timer when the window is reported visible twice", () => {
    const tick = vi.fn();
    const loop = startRefreshLoop(tick);

    setVisibility("visible");
    setVisibility("visible");
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS);
    loop.stop();

    // Two immediate reads, then one tick — not two timers racing each other.
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("never starts while the window is already hidden", () => {
    const tick = vi.fn();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    const loop = startRefreshLoop(tick);
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 2);
    loop.stop();

    expect(tick).not.toHaveBeenCalled();
  });

  it("stops ticking and stops listening once stopped", () => {
    const tick = vi.fn();

    const loop = startRefreshLoop(tick);
    loop.stop();
    setVisibility("visible");
    vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 2);

    expect(tick).not.toHaveBeenCalled();
  });

  it("takes the interval it is given", () => {
    const tick = vi.fn();

    const loop = startRefreshLoop(tick, 100);
    vi.advanceTimersByTime(250);
    loop.stop();

    expect(tick).toHaveBeenCalledTimes(2);
  });
});
