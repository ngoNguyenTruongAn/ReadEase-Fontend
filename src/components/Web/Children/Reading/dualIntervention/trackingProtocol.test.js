import { describe, expect, it, vi } from "vitest";
import { createTooltipShownEvent, createTrackingPoint } from "./trackingProtocol";

describe("trackingProtocol", () => {
  it("creates mouse tracking point with both camelCase and snake_case word index", () => {
    const point = createTrackingPoint({
      x: 120,
      y: 48,
      timestamp: 123456,
      wordIndex: 9,
    });

    expect(point).toEqual({
      x: 120,
      y: 48,
      timestamp: 123456,
      wordIndex: 9,
      word_index: 9,
    });
  });

  it("acks tooltip show with both wordIndex and word_index", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T00:00:00.000Z"));

    const event = createTooltipShownEvent({
      tooltip: {
        wordIndex: 4,
        original: "con bò",
        simplified: "con bò",
      },
      cognitiveState: "REGRESSION",
    });

    expect(event).toMatchObject({
      event: "tooltip:show",
      data: {
        source: "frontend",
        wordIndex: 4,
        word_index: 4,
        original: "con bò",
        simplified: "con bò",
        cognitiveState: "REGRESSION",
      },
    });

    vi.useRealTimers();
  });
});
