import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NAVIGATE_DELAY_MS, SECRET_WINDOW_MS, secretClicks } from "@/lib/passport-clicks";

// Fake timers fake Date.now too, so the window and the navigation delay run on the same clock.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function trigger({ link = false } = {}) {
  const calls: string[] = [];
  const clicks = secretClicks({
    wiggle: () => calls.push("wiggle"),
    flip: () => calls.push("flip"),
    open: () => calls.push("open"),
    ...(link && { navigate: () => calls.push("navigate") }),
  });
  return { calls, clicks };
}

describe("secretClicks", () => {
  it("wiggles, flips, then opens on three activations", () => {
    const { calls, clicks } = trigger();
    clicks.activate();
    expect(calls).toEqual(["wiggle"]);
    vi.advanceTimersByTime(500);
    clicks.activate();
    expect(calls).toEqual(["wiggle", "flip"]);
    vi.advanceTimersByTime(500);
    clicks.activate();
    expect(calls).toEqual(["wiggle", "flip", "open"]);
  });

  it("counts a gap of exactly the window, measured from the previous activation", () => {
    const { calls, clicks } = trigger();
    clicks.activate();
    vi.advanceTimersByTime(SECRET_WINDOW_MS);
    clicks.activate();
    vi.advanceTimersByTime(SECRET_WINDOW_MS);
    clicks.activate();
    expect(calls).toEqual(["wiggle", "flip", "open"]);
  });

  it("starts over after a gap longer than the window", () => {
    const { calls, clicks } = trigger();
    clicks.activate();
    clicks.activate();
    vi.advanceTimersByTime(SECRET_WINDOW_MS + 1);
    clicks.activate();
    expect(calls).toEqual(["wiggle", "flip", "wiggle"]);
  });

  it("does nothing more after two activations and then nothing", () => {
    const { calls, clicks } = trigger({ link: true });
    clicks.activate();
    clicks.activate();
    vi.advanceTimersByTime(10_000);
    expect(calls).toEqual(["wiggle", "flip"]);
  });

  it("starts over after opening", () => {
    const { calls, clicks } = trigger();
    clicks.activate();
    clicks.activate();
    clicks.activate();
    clicks.activate();
    expect(calls).toEqual(["wiggle", "flip", "open", "wiggle"]);
  });

  describe("on a link", () => {
    it("navigates after the delay when no second activation follows", () => {
      const { calls, clicks } = trigger({ link: true });
      clicks.activate();
      vi.advanceTimersByTime(NAVIGATE_DELAY_MS - 1);
      expect(calls).toEqual(["wiggle"]);
      vi.advanceTimersByTime(1);
      expect(calls).toEqual(["wiggle", "navigate"]);
    });

    it("doesn't navigate when a second activation comes within the delay", () => {
      const { calls, clicks } = trigger({ link: true });
      clicks.activate();
      vi.advanceTimersByTime(NAVIGATE_DELAY_MS - 1);
      clicks.activate();
      vi.advanceTimersByTime(NAVIGATE_DELAY_MS * 10);
      expect(calls).toEqual(["wiggle", "flip"]);
    });

    it("never navigates on the way to opening", () => {
      const { calls, clicks } = trigger({ link: true });
      clicks.activate();
      vi.advanceTimersByTime(100);
      clicks.activate();
      vi.advanceTimersByTime(1000);
      clicks.activate();
      vi.runAllTimers();
      expect(calls).toEqual(["wiggle", "flip", "open"]);
    });

    it("navigates once per activation that starts a new count", () => {
      const { calls, clicks } = trigger({ link: true });
      clicks.activate();
      vi.advanceTimersByTime(SECRET_WINDOW_MS + 1);
      clicks.activate();
      vi.runAllTimers();
      expect(calls).toEqual(["wiggle", "navigate", "wiggle", "navigate"]);
    });

    it("drops a pending navigation when disposed", () => {
      const { calls, clicks } = trigger({ link: true });
      clicks.activate();
      clicks.dispose();
      vi.runAllTimers();
      expect(calls).toEqual(["wiggle"]);
    });
  });

  it("never navigates a trigger that isn't a link", () => {
    const { calls, clicks } = trigger();
    clicks.activate();
    vi.runAllTimers();
    expect(calls).toEqual(["wiggle"]);
  });
});
