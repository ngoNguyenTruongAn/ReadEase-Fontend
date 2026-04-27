import {
  createTooltipFromSocketPayload,
  interpretTrackingSocketEvent,
} from "./socketEventInterpreter";
import { describe, expect, it } from "vitest";

describe("socketEventInterpreter", () => {
  it("interprets intervention reset event", () => {
    const result = interpretTrackingSocketEvent({
      message: { event: "intervention:reset", data: {} },
      currentWordIndex: 3,
    });

    expect(result).toEqual({ type: "reset" });
  });

  it("interprets adaptation trigger with mode and params", () => {
    const result = interpretTrackingSocketEvent({
      message: {
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          type: "VISUAL",
          mode: "DUAL_INTERVENTION",
          confidence: 0.91,
          params: {
            letterSpacing: 0.08,
            colorBanding: true,
            transitionMs: 140,
          },
          wordIndex: 6,
        },
      },
      currentWordIndex: 2,
    });

    expect(result.type).toBe("adaptation");
    expect(result.payload).toMatchObject({
      state: "REGRESSION",
      adaptationType: "VISUAL",
      mode: "DUAL_INTERVENTION",
      wordIndex: 6,
    });
    expect(result.payload.params).toMatchObject({
      letterSpacing: 0.08,
      colorBanding: true,
      transitionMs: 140,
    });
  });

  it("builds tooltip with cursor fallback and token-based text fallback", () => {
    const tooltip = createTooltipFromSocketPayload({
      payload: {
        requestId: "tip-1",
        cursorX: 240,
        cursorY: 120,
        original: null,
        simplified: null,
        cognitiveState: "REGRESSION",
      },
      currentWordIndex: 4,
      resolveTooltipByWordIndex: (wordIndex) => {
        if (wordIndex === 4) {
          return {
            original: "con bò",
            simplified: "con bò",
          };
        }
        return null;
      },
    });

    expect(tooltip).toMatchObject({
      id: "tip-1",
      anchorType: "cursor",
      wordIndex: 4,
      original: "con bò",
      simplified: "con bò",
      cognitiveState: "REGRESSION",
      cursorX: 240,
      cursorY: 120,
    });
  });
});
