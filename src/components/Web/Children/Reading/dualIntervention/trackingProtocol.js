export const TRACKING_SOCKET_PATH = "/tracking";
export const DEFAULT_FLUSH_INTERVAL_MS = 100;
export const DEFAULT_FLUENT_TIMEOUT_MS = 6000;
export const DISTRACTION_HINT_DURATION_MS = 1600;

const TRACKING_TOKEN_KEYS = ["tracking_token", "trackingToken", "ws_token", "wsToken"];
const ACCESS_TOKEN_KEYS = ["access_token", "accessToken", "token"];

const toStringSafe = (value) => String(value ?? "").trim();

const decodeJwtPayload = (token) => {
  const normalizedToken = toStringSafe(token);
  const parts = normalizedToken.split(".");
  if (parts.length < 2) return null;

  const payloadBase64 = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const paddedPayload = payloadBase64.padEnd(
    payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4),
    "=",
  );

  try {
    if (typeof atob !== "function") {
      return null;
    }

    const decoded = atob(paddedPayload);

    const decodedUtf8 = decodeURIComponent(
      decoded
        .split("")
        .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );

    const parsed = JSON.parse(decodedUtf8);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const resolveTokenByKeys = (keys) => {
  if (typeof window === "undefined") return { token: "", sourceKey: "" };

  for (const key of keys) {
    const token = toStringSafe(window.localStorage.getItem(key));
    if (token) {
      return {
        token,
        sourceKey: key,
      };
    }
  }

  return { token: "", sourceKey: "" };
};

export const getTrackingAuthTokenContext = () => {
  const trackingTokenCandidate = resolveTokenByKeys(TRACKING_TOKEN_KEYS);
  const accessTokenCandidate = resolveTokenByKeys(ACCESS_TOKEN_KEYS);

  const token = trackingTokenCandidate.token || accessTokenCandidate.token;
  const sourceKey = trackingTokenCandidate.token
    ? trackingTokenCandidate.sourceKey
    : accessTokenCandidate.sourceKey;

  const payload = token ? decodeJwtPayload(token) : null;
  const hasRequiredClaims =
    Boolean(payload) &&
    Boolean(toStringSafe(payload?.user_id)) &&
    Boolean(toStringSafe(payload?.session_id));

  return {
    token,
    sourceKey,
    payload,
    hasRequiredClaims,
  };
};

export const createTrackingSessionId = () =>
  `reading-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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
  return getTrackingAuthTokenContext().token;
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
    ...(toStringSafe(contentId) ? { contentId: toStringSafe(contentId) } : {}),
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
    ...(resolvedWordIndex !== null
      ? {
          wordIndex: resolvedWordIndex,
          word_index: resolvedWordIndex,
        }
      : {}),
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
    ...(Number.isInteger(tooltip?.wordIndex)
      ? {
          wordIndex: tooltip.wordIndex,
          word_index: tooltip.wordIndex,
        }
      : {}),
    ...(toStringSafe(tooltip?.original)
      ? { original: toStringSafe(tooltip?.original) }
      : {}),
    ...(toStringSafe(tooltip?.simplified)
      ? { simplified: toStringSafe(tooltip?.simplified) }
      : {}),
    ...((cognitiveState || tooltip?.cognitiveState)
      ? { cognitiveState: cognitiveState || tooltip?.cognitiveState }
      : {}),
  },
});
