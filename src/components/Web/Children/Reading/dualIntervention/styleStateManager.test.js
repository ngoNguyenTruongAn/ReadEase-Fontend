import {
  ADAPTATION_STATES,
  VISUAL_MODES,
  createVisualFlagsFromAdaptation,
  createVisualStyleVars,
} from "./styleStateManager";
import { describe, expect, it } from "vitest";

describe("styleStateManager", () => {
  it("applies adaptation params to visual flags", () => {
    const flags = createVisualFlagsFromAdaptation({
      state: ADAPTATION_STATES.DISTRACTION,
      mode: VISUAL_MODES.VISUAL_ONLY,
      confidence: 0.5,
      params: {
        letterSpacing: 0.06,
        colorBanding: true,
        transitionMs: 180,
      },
    });

    expect(flags.isVisualActive).toBe(true);
    expect(flags.isLetterSpacingExpanded).toBe(true);
    expect(flags.isColorBandingEnabled).toBe(true);
    expect(flags.mode).toBe(VISUAL_MODES.VISUAL_ONLY);

    const styleVars = createVisualStyleVars(flags);
    expect(styleVars["--reading-letter-spacing"]).toBe("0.06em");
    expect(styleVars["--reading-transition-ms"]).toBe("180ms");
  });
});
