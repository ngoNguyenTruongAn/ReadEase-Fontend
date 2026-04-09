export const ADAPTATION_STATES = {
  FLUENT: "FLUENT",
  DISTRACTION: "DISTRACTION",
  REGRESSION: "REGRESSION",
};

export const VISUAL_MODES = {
  VISUAL_ONLY: "VISUAL_ONLY",
  DUAL_INTERVENTION: "DUAL_INTERVENTION",
};

const toStringSafe = (value) => String(value ?? "").trim();

const toFiniteNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const resolveAdaptationState = (value) => {
  const normalized = toStringSafe(value).toUpperCase();
  return ADAPTATION_STATES[normalized] || ADAPTATION_STATES.FLUENT;
};

export const resolveVisualMode = (value) => {
  const normalized = toStringSafe(value).toUpperCase();
  return VISUAL_MODES[normalized] || VISUAL_MODES.VISUAL_ONLY;
};

export const createConfidenceClassName = (confidence) => {
  if (!Number.isFinite(confidence)) return "confidence-medium";
  if (confidence >= 0.75) return "confidence-high";
  if (confidence >= 0.45) return "confidence-medium";
  return "confidence-low";
};

export const INITIAL_VISUAL_FLAGS = {
  isVisualActive: false,
  isLetterSpacingExpanded: false,
  isColorBandingEnabled: false,
  confidence: null,
  confidenceClassName: "",
  state: ADAPTATION_STATES.FLUENT,
  mode: null,
  letterSpacingEm: 0.055,
  transitionMs: 200,
  colorBandingStrength: 0.13,
};

export const INITIAL_WORD_INTERVENTION = {
  distractionWordIndex: null,
  regressionWordIndex: null,
  semanticWordIndex: null,
};

const getDefaultLetterSpacingByMode = (mode) =>
  mode === VISUAL_MODES.DUAL_INTERVENTION ? 0.082 : 0.048;

const getDefaultTransitionByMode = (mode) =>
  mode === VISUAL_MODES.DUAL_INTERVENTION ? 140 : 220;

const getDefaultColorBandingByMode = (mode) =>
  mode === VISUAL_MODES.DUAL_INTERVENTION ? 0.18 : 0.13;

export const createVisualFlagsFromAdaptation = ({
  state,
  mode,
  confidence,
  params,
}) => {
  const resolvedState = resolveAdaptationState(state);
  if (resolvedState === ADAPTATION_STATES.FLUENT) {
    return INITIAL_VISUAL_FLAGS;
  }

  const resolvedMode = resolveVisualMode(mode);
  const resolvedConfidence = toFiniteNumberOrNull(confidence);

  const rawLetterSpacing = toFiniteNumberOrNull(params?.letterSpacing);
  const rawTransitionMs =
    toFiniteNumberOrNull(params?.transitionMs) ??
    toFiniteNumberOrNull(params?.transition);
  const rawColorBanding =
    toFiniteNumberOrNull(params?.colorBandingStrength) ??
    toFiniteNumberOrNull(params?.colorBanding);

  const explicitColorBandingToggle =
    typeof params?.colorBanding === "boolean" ? params.colorBanding : null;

  const letterSpacingEm = clamp(
    rawLetterSpacing ?? getDefaultLetterSpacingByMode(resolvedMode),
    0,
    0.2,
  );
  const transitionMs = clamp(
    rawTransitionMs ?? getDefaultTransitionByMode(resolvedMode),
    80,
    1200,
  );
  const colorBandingStrength = clamp(
    rawColorBanding ?? getDefaultColorBandingByMode(resolvedMode),
    0.02,
    0.4,
  );

  const isColorBandingEnabled =
    explicitColorBandingToggle !== null
      ? explicitColorBandingToggle
      : colorBandingStrength > 0;

  return {
    isVisualActive: true,
    isLetterSpacingExpanded: letterSpacingEm > 0,
    isColorBandingEnabled,
    confidence: resolvedConfidence,
    confidenceClassName: createConfidenceClassName(resolvedConfidence),
    state: resolvedState,
    mode: resolvedMode,
    letterSpacingEm,
    transitionMs,
    colorBandingStrength,
  };
};

export const createVisualStyleVars = (visualFlags) => {
  if (!visualFlags?.isVisualActive) return {};

  return {
    "--reading-letter-spacing": `${visualFlags.letterSpacingEm ?? 0.055}em`,
    "--reading-transition-ms": `${visualFlags.transitionMs ?? 200}ms`,
    "--reading-color-banding-strong": String(visualFlags.colorBandingStrength ?? 0.13),
    "--reading-color-banding-soft": String(
      Math.max((visualFlags.colorBandingStrength ?? 0.13) * 0.36, 0.02),
    ),
  };
};
