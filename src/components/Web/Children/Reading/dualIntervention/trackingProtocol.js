export const TRACKING_SOCKET_PATH = "/tracking";
export const DEFAULT_FLUSH_INTERVAL_MS = 100;
export const DEFAULT_FLUENT_TIMEOUT_MS = 6000;
export const DISTRACTION_HINT_DURATION_MS = 1600;

const ACCESS_TOKEN_KEYS = ["access_token", "accessToken", "token"];

const toStringSafe = (value) => String(value ?? "").trim();

const normalizeApiBaseForTracking = (value) =>
  toStringSafe(value)
    .replace(/\/api\/v\d+\/?$/i, "/")
    .replace(/\/+$/, "") || "";

const toWsProtocolUrl = (value) => {
  const normalized = toStringSafe(value);
  if (!normalized) return "";

  if (/^wss?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized
      .replace(/^https:\/\//i, "wss://")
      .replace(/^http:\/\//i, "ws://");
  }

  if (typeof window !== "undefined") {
    return toWsProtocolUrl(new URL(normalized, window.location.origin).toString());
  }

  return normalized;
};

export const getTrackingAuthToken = () => {
  if (typeof window === "undefined") return "";

  for (const key of ACCESS_TOKEN_KEYS) {
    const token = toStringSafe(window.localStorage.getItem(key));
    if (token) return token;
  }

  return "";
};

export const resolveTrackingSocketUrl = ({ trackingBaseUrl, apiBaseUrl, token }) => {
  const envTrackingBase = toStringSafe(import.meta.env?.VITE_TRACKING_WS_URL);
  const envApiBase = toStringSafe(import.meta.env?.VITE_API_BASE_URL);

  const fallbackOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const preferredBase =
    toStringSafe(trackingBaseUrl) ||
    envTrackingBase ||
    normalizeApiBaseForTracking(toStringSafe(apiBaseUrl) || envApiBase) ||
    fallbackOrigin;

  const wsBase = toWsProtocolUrl(preferredBase);
  const socketUrl = new URL(TRACKING_SOCKET_PATH, `${wsBase}/`);

  if (token) {
    socketUrl.searchParams.set("token", token);
  }

  return socketUrl.toString();
};

export const parseTrackingSocketMessage = (rawData) => {
  try {
    const parsed = JSON.parse(rawData);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const createSessionStartEvent = ({ contentId }) => ({
  event: "session:start",
  data: {
    contentId: toStringSafe(contentId) || null,
    timestamp: Date.now(),
  },
});

export const createMouseBatchEvent = (points) => ({
  event: "mouse:batch",
  data: { points },
});

export const createTrackingPoint = ({ x, y, timestamp = Date.now(), wordIndex }) => {
  const resolvedWordIndex = Number.isInteger(wordIndex) ? wordIndex : null;
  return {
    x,
    y,
    timestamp,
    wordIndex: resolvedWordIndex,
    word_index: resolvedWordIndex,
  };
};

export const createSessionEndEvent = () => ({
  event: "session:end",
  data: { timestamp: Date.now() },
});

export const createTooltipShownEvent = ({ tooltip, cognitiveState }) => ({
  event: "tooltip:show",
  data: {
    source: "frontend",
    timestamp: Date.now(),
    wordIndex: Number.isInteger(tooltip?.wordIndex) ? tooltip.wordIndex : null,
    word_index: Number.isInteger(tooltip?.wordIndex) ? tooltip.wordIndex : null,
    original: toStringSafe(tooltip?.original) || null,
    simplified: toStringSafe(tooltip?.simplified) || null,
    cognitiveState: cognitiveState || tooltip?.cognitiveState || null,
  },
});
