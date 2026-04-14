import { resolveAdaptationState } from "./styleStateManager";

const toStringSafe = (value) => String(value ?? "").trim();

const normalizeEventName = (value) =>
  toStringSafe(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, ":");

const isEventIn = (eventName, candidates) =>
  candidates.some((candidate) => eventName === normalizeEventName(candidate));

const toIntegerOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) ? parsed : Math.round(parsed);
};

const resolveWordIndexFromPayload = (payload, fallbackWordIndex) => {
  const candidates = [
    payload?.wordIndex,
    payload?.word_index,
    payload?.targetWordIndex,
    payload?.target_word_index,
    payload?.word?.index,
    payload?.meta?.wordIndex,
    payload?.meta?.word_index,
    fallbackWordIndex,
  ];

  for (const candidate of candidates) {
    const parsed = toIntegerOrNull(candidate);
    if (parsed !== null && parsed >= 0) return parsed;
  }

  return null;
};

const resolveCursorPayload = (payload) => {
  const xCandidates = [payload?.cursorX, payload?.cursor_x, payload?.x];
  const yCandidates = [payload?.cursorY, payload?.cursor_y, payload?.y];

  const x = xCandidates.map(toIntegerOrNull).find((value) => value !== null);
  const y = yCandidates.map(toIntegerOrNull).find((value) => value !== null);

  if (x === undefined || y === undefined) return null;
  if (x === null || y === null) return null;
  return { x, y };
};

const buildFallbackTooltipText = ({ wordIndex, fallbackTooltip }) => {
  const fallbackOriginal =
    toStringSafe(fallbackTooltip?.original) ||
    toStringSafe(fallbackTooltip?.word) ||
    toStringSafe(fallbackTooltip?.value);

  if (fallbackOriginal) {
    return {
      original: fallbackOriginal,
      simplified:
        toStringSafe(fallbackTooltip?.simplified) ||
        toStringSafe(fallbackTooltip?.hint) ||
        fallbackOriginal,
    };
  }

  if (Number.isInteger(wordIndex)) {
    return {
      original: `Từ #${wordIndex}`,
      simplified: `Từ #${wordIndex}`,
    };
  }

  return {
    original: "Giải thích từ",
    simplified: "Giải thích từ",
  };
};

const resolveTooltipAnchor = ({ wordIndex, cursor, currentWordIndex }) => {
  if (Number.isInteger(wordIndex) && wordIndex >= 0) {
    return {
      anchorType: "word",
      wordIndex,
    };
  }

  if (cursor) {
    return {
      anchorType: "cursor",
      wordIndex: Number.isInteger(currentWordIndex) ? currentWordIndex : null,
      cursorX: cursor.x,
      cursorY: cursor.y,
    };
  }

  if (Number.isInteger(currentWordIndex) && currentWordIndex >= 0) {
    return {
      anchorType: "word",
      wordIndex: currentWordIndex,
    };
  }

  return {
    anchorType: "viewport",
    wordIndex: null,
  };
};

export const createTooltipFromSocketPayload = ({
  payload,
  currentWordIndex,
  resolveTooltipByWordIndex,
}) => {
  const payloadWordIndex = resolveWordIndexFromPayload(payload, null);
  const fallbackWordIndex =
    Number.isInteger(payloadWordIndex) && payloadWordIndex >= 0
      ? payloadWordIndex
      : Number.isInteger(currentWordIndex)
        ? currentWordIndex
        : null;

  const fallbackTooltip =
    Number.isInteger(fallbackWordIndex) && fallbackWordIndex >= 0
      ? resolveTooltipByWordIndex?.(fallbackWordIndex) || null
      : null;

  const fallbackText = buildFallbackTooltipText({
    wordIndex: fallbackWordIndex,
    fallbackTooltip,
  });
  const original =
    toStringSafe(payload?.original) || toStringSafe(payload?.word) || fallbackText.original;
  const simplified =
    toStringSafe(payload?.simplified) ||
    toStringSafe(payload?.hint) ||
    toStringSafe(payload?.explanation) ||
    fallbackText.simplified;

  const cursor = resolveCursorPayload(payload);
  const anchor = resolveTooltipAnchor({
    wordIndex: payloadWordIndex,
    cursor,
    currentWordIndex,
  });

  return {
    id:
      toStringSafe(payload?.requestId) ||
      `tooltip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    visible: true,
    wordIndex: Number.isInteger(anchor.wordIndex) ? anchor.wordIndex : null,
    original,
    simplified,
    cognitiveState: resolveAdaptationState(payload?.state || payload?.cognitiveState),
    anchorType: anchor.anchorType,
    cursorX: anchor.cursorX ?? null,
    cursorY: anchor.cursorY ?? null,
  };
};

export const interpretTrackingSocketEvent = ({ message, currentWordIndex }) => {
  if (!message) {
    return { type: "ignore" };
  }

  const eventName = normalizeEventName(message.event || message.type || message.name);
  if (!eventName) return { type: "ignore" };

  const payload = message?.data || {};

  if (isEventIn(eventName, ["intervention:reset", "adaptation:reset", "session:reset"])) {
    return {
      type: "reset",
    };
  }

  if (
    isEventIn(eventName, [
      "adaptation:trigger",
      "adaptation:triggered",
      "intervention:trigger",
      "intervention:adaptation",
    ])
  ) {
    return {
      type: "adaptation",
      payload: {
        state: resolveAdaptationState(payload?.state || payload?.cognitiveState),
        mode: toStringSafe(payload?.mode).toUpperCase() || null,
        adaptationType: toStringSafe(payload?.type).toUpperCase() || null,
        confidence: payload?.confidence,
        params: payload?.params || {},
        wordIndex: resolveWordIndexFromPayload(payload, currentWordIndex),
      },
    };
  }

  if (
    isEventIn(eventName, [
      "tooltip:show",
      "tooltip:display",
      "intervention:tooltip",
      "semantic:tooltip",
    ])
  ) {
    if (toStringSafe(payload?.source).toLowerCase() === "frontend") {
      return { type: "ignore" };
    }

    return {
      type: "tooltip",
      payload,
    };
  }

  return { type: "ignore" };
};

export const __testing = {
  resolveWordIndexFromPayload,
  resolveCursorPayload,
  resolveTooltipAnchor,
};
