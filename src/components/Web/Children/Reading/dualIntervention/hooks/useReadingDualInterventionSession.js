import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DEFAULT_FLUENT_TIMEOUT_MS,
  DEFAULT_FLUSH_INTERVAL_MS,
  DISTRACTION_HINT_DURATION_MS,
  createTrackingPoint,
  createTrackingSessionId,
  createMouseBatchEvent,
  createSessionEndEvent,
  createSessionStartEvent,
  getTrackingAuthTokenContext,
  parseTrackingSocketMessage,
  resolveTrackingSocketUrl,
} from "../trackingProtocol";
import { interpretTrackingSocketEvent } from "../socketEventInterpreter";
import {
  ADAPTATION_STATES,
  INITIAL_VISUAL_FLAGS,
  INITIAL_WORD_INTERVENTION,
  createVisualFlagsFromAdaptation,
} from "../styleStateManager";

const INITIAL_TRACKING_DEBUG = {
  authTokenReady: false,
  tokenSourceKey: "",
  tokenClaimsReady: false,
  wsStatus: "idle",
  wsUrl: "",
  wsCloseCode: null,
  wsCloseReason: "",
  sessionId: "",
  trackingContentId: null,
  outbound: {
    sessionStart: 0,
    mouseBatch: 0,
    tooltipShow: 0,
    sessionEnd: 0,
    unknown: 0,
  },
  inbound: {
    adaptation: 0,
    tooltip: 0,
    reset: 0,
    ignored: 0,
    parseError: 0,
  },
  totalBatchesSent: 0,
  totalPointsSent: 0,
  lastBatchSize: 0,
  bufferedPoints: 0,
  reconnectAttempts: 0,
  handshakeVariant: "tracking:token-only",
  sessionStartStrategy: "with-content-id",
  pointsWithWordIndex: 0,
  pointsWithoutWordIndex: 0,
  syntheticPoints: 0,
  localFallbackInterventions: 0,
  localFallbackActive: false,
  localFallbackReason: "",
  localFallbackWordIndex: null,
  lastSocketUptimeMs: 0,
  lastOutboundEvent: "",
  lastInboundEvent: "",
  lastError: "",
  lastUpdateAt: null,
};

const OUTBOUND_EVENT_MAP = {
  "session:start": "sessionStart",
  "mouse:batch": "mouseBatch",
  "tooltip:show": "tooltipShow",
  "session:end": "sessionEnd",
};

const INBOUND_EVENT_MAP = {
  adaptation: "adaptation",
  tooltip: "tooltip",
  reset: "reset",
  ignore: "ignored",
  parseError: "parseError",
};

const MAX_RECONNECT_ATTEMPTS = 24;
const EARLY_FLUSH_MIN_POINTS = 8;
const EARLY_FLUSH_COOLDOWN_MS = 80;
const DWELL_SAMPLE_INTERVAL_MS = 140;
const MIN_STABLE_SOCKET_UPTIME_MS = 2500;
const QUICK_CLOSE_THRESHOLD_MS = 180;
// DEV cooldown khớp với fluentTimeoutMs (6000ms) để đảm bảo intervention cũ
// tắt xong trước khi cho phép fire tiếp — tránh style nhảy liên tục khi test.
const LOCAL_FALLBACK_COOLDOWN_MS = import.meta.env.DEV ? 6000 : 3600;
// The long cooldown is for same-word repeats; different words retarget with this shorter gap.
const LOCAL_FALLBACK_INTERRUPT_GAP_MS = 800;
const PAGE_CHANGE_STALE_EVENT_GUARD_MS = 900;
const LOCAL_FALLBACK_SIGNAL_RESET_MS = 5000;
const LOCAL_FALLBACK_DWELL_MIN_MS = 4200;
const LOCAL_FALLBACK_DWELL_POINTER_TOLERANCE_PX = 6;
const LOCAL_FALLBACK_DWELL_MOTION_STEP_PX = 0.75;
const LOCAL_FALLBACK_DWELL_MOTION_RESET_PX = 3;
const LOCAL_FALLBACK_ERRATIC_WINDOW_MS = 1800;
const LOCAL_FALLBACK_ERRATIC_MIN_POINTS = 8;
const LOCAL_FALLBACK_ERRATIC_MIN_PATH_PX = 280;
const LOCAL_FALLBACK_ERRATIC_MIN_DIRECTION_CHANGES = 4;
const LOCAL_FALLBACK_ERRATIC_MAX_PATH_EFFICIENCY = 0.48;
const LOCAL_FALLBACK_ERRATIC_MIN_MEAN_SPEED_PX_MS = 0.22;
const LOCAL_FALLBACK_ERRATIC_MIN_PEAK_SPEED_PX_MS = 0.55;
const LOCAL_FALLBACK_ERRATIC_MAX_ORDERED_FORWARD_RATIO = 0.62;
// DEV_TEST_MODE: hạ threshold để dễ trigger REGRESSION khi test thủ công,
// nhưng vẫn đủ cao để không bắt zigzag tự nhiên khi di chuột đọc bình thường.
// Trước khi release, restore về: MIN_TOTAL_DELTA=2, MIN_EVENTS=2, MIN_DURATION_MS=3000, MAX_GAP_MS=1800
const DEV_TEST_REGRESSION = import.meta.env.DEV;
const LOCAL_FALLBACK_REGRESSION_MIN_STEP_DELTA = 1;
const LOCAL_FALLBACK_REGRESSION_MIN_TOTAL_DELTA = DEV_TEST_REGRESSION ? 2 : 2;
const LOCAL_FALLBACK_REGRESSION_MIN_EVENTS      = DEV_TEST_REGRESSION ? 3 : 2;
const LOCAL_FALLBACK_REGRESSION_MIN_DURATION_MS = DEV_TEST_REGRESSION ? 1500 : 3000;
const LOCAL_FALLBACK_REGRESSION_MAX_GAP_MS      = DEV_TEST_REGRESSION ? 3000 : 1800;
const LOCAL_FALLBACK_BEHAVIOR_READY_TTL_MS = 4000;
const LINE_WRAP_VERTICAL_THRESHOLD_PX = 14;
const LINE_WRAP_LEFTWARD_THRESHOLD_PX = 12;
const LINE_WRAP_SETTLE_TTL_MS = 2200;
const LINE_WRAP_SETTLE_MAX_BACKTRACK_WORDS = 6;
const LINE_WRAP_SETTLE_MAX_FORWARD_WORDS = 4;
const LINE_WRAP_DESCENT_MIN_VERTICAL_PX = 2;
const LINE_WRAP_DESCENT_MIN_LEFTWARD_PX = 4;
const LINE_WRAP_DESCENT_MAX_RIGHTWARD_PX = 8;
const LINE_WRAP_DESCENT_LOWER_WORD_RATIO = 0.45;
const LINE_WRAP_DESCENT_RIGHT_EDGE_RATIO = 0.35;

const HANDSHAKE_VARIANTS = [
  "tracking:token-only",
];

const scheduleMicrotask =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback) => Promise.resolve().then(callback);

const createInitialLocalFallbackSignal = (lastTriggeredAt = 0) => ({
  lastWordIndex: null,
  dwellWordIndex: null,
  dwellStartedAt: null,
  dwellX: null,
  dwellY: null,
  dwellLastX: null,
  dwellLastY: null,
  dwellMotionDistance: 0,
  dwellLastMotionAt: null,
  lastObservedAt: null,
  lastTriggeredAt,
  dwellReadyAt: null,
  regressionStartedAt: null,
  regressionStartWordIndex: null,
  regressionLowestWordIndex: null,
  regressionStepCount: 0,
  regressionLastBackwardAt: null,
  regressionReadyAt: null,
  regressionReadyWordIndex: null,
  // LOOP detection: đếm số lần đổi chiều trong vùng hẹp
  loopZoneMin: null,
  loopZoneMax: null,
  loopDirectionChanges: 0,
  loopLastDirection: null,
  loopStartedAt: null,
  lastWordLayoutTop: null,
  lastWordLayoutLeft: null,
  lineWrapGuardStartedAt: null,
  lineWrapGuardMinWordIndex: null,
  lineWrapGuardMaxWordIndex: null,
  lineWrapGuardLineTop: null,
  erraticPoints: [],
  erraticReadyAt: null,
  erraticReadyWordIndex: null,
});

const resetRegressionSignal = (signal, { clearReadiness = true } = {}) => {
  signal.regressionStartedAt = null;
  signal.regressionStartWordIndex = null;
  signal.regressionLowestWordIndex = null;
  signal.regressionStepCount = 0;
  signal.regressionLastBackwardAt = null;
  if (clearReadiness) {
    signal.regressionReadyAt = null;
    signal.regressionReadyWordIndex = null;
  }
};

const resetLoopSignal = (signal) => {
  signal.loopZoneMin = null;
  signal.loopZoneMax = null;
  signal.loopDirectionChanges = 0;
  signal.loopLastDirection = null;
  signal.loopStartedAt = null;
};

const resetLineWrapGuard = (signal) => {
  signal.lineWrapGuardStartedAt = null;
  signal.lineWrapGuardMinWordIndex = null;
  signal.lineWrapGuardMaxWordIndex = null;
  signal.lineWrapGuardLineTop = null;
};

const resetErraticSignal = (signal, { clearReadiness = true } = {}) => {
  signal.erraticPoints = [];
  if (clearReadiness) {
    signal.erraticReadyAt = null;
    signal.erraticReadyWordIndex = null;
  }
};

// Vùng hẹp tối đa để tính là LOOP (số từ)
const LOOP_ZONE_WIDTH = 4;
// Số lần đổi chiều tối thiểu để fire LOOP
const LOOP_MIN_DIRECTION_CHANGES = 3;

const toIntegerOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) ? parsed : Math.round(parsed);
};

const resolveSessionStartStrategyLabel = (strategy) => {
  if (strategy <= 0) return "with-content-id";
  if (strategy === 1) return "without-content-id";
  return "skip-session-start";
};

const resolveHandshakeVariantLabel = (variantIndex) =>
  HANDSHAKE_VARIANTS[Math.max(0, Math.min(variantIndex, HANDSHAKE_VARIANTS.length - 1))];

const REGRESSION_TYPES = new Set(["MILD", "STRONG", "LOOP", "STALL"]);

const normalizeRegressionTypeValue = (value) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return REGRESSION_TYPES.has(normalized) ? normalized : null;
};

const normalizeRegressionType = (payload) => {
  const raw =
    payload?.regressionType ||
    payload?.regression_type ||
    payload?.params?.regressionType ||
    payload?.params?.regression_type ||
    "";
  return normalizeRegressionTypeValue(raw) || "MILD";
};

const resolveFocusRadius = (payload, fallback = 0) => {
  const raw =
    payload?.regressionFocusRadius ??
    payload?.focusRadius ??
    payload?.focus_radius ??
    payload?.params?.regressionFocusRadius ??
    payload?.params?.focusRadius ??
    payload?.params?.focus_radius;
  const parsed = toIntegerOrNull(raw);
  return parsed !== null && parsed >= 0 ? parsed : fallback;
};

const getWordLayoutSnapshot = (wordElement) => {
  const rect = wordElement?.getBoundingClientRect?.();
  if (!rect) return null;

  const top = Number(rect.top);
  const left = Number(rect.left);
  if (!Number.isFinite(top) || !Number.isFinite(left)) return null;

  const width = Number(rect.width);
  const height = Number(rect.height);
  const right = Number.isFinite(Number(rect.right))
    ? Number(rect.right)
    : Number.isFinite(width)
      ? left + width
      : null;
  const bottom = Number.isFinite(Number(rect.bottom))
    ? Number(rect.bottom)
    : Number.isFinite(height)
      ? top + height
      : null;

  return { top, left, right, bottom, width, height };
};

const getWordElementByIndex = (wordElement, wordIndex) => {
  if (!Number.isInteger(wordIndex)) return null;
  const root = wordElement?.closest?.(".reading-book-view") || wordElement?.parentElement;
  return root?.querySelector?.(`.reading-word[data-word-index="${wordIndex}"]`) || null;
};

const getAdjacentWordLayoutSnapshot = (wordElement, wordIndex, offset) =>
  getWordLayoutSnapshot(getWordElementByIndex(wordElement, wordIndex + offset));

const isSameVisualLine = (leftTop, rightTop) =>
  Number.isFinite(leftTop) &&
  Number.isFinite(rightTop) &&
  Math.abs(leftTop - rightTop) <= LINE_WRAP_VERTICAL_THRESHOLD_PX;

const isLowerVisualLine = (previousTop, nextTop) =>
  Number.isFinite(previousTop) &&
  Number.isFinite(nextTop) &&
  nextTop - previousTop > LINE_WRAP_VERTICAL_THRESHOLD_PX;

const isLikelyLineWrapForward = ({ previousTop, nextTop, previousLeft, nextLeft }) =>
  isLowerVisualLine(previousTop, nextTop) &&
  Number.isFinite(previousLeft) &&
  Number.isFinite(nextLeft) &&
  previousLeft - nextLeft > LINE_WRAP_LEFTWARD_THRESHOLD_PX;

const isForwardLowerLineTransition = ({ wordDelta, previousTop, nextTop }) =>
  wordDelta > 0 && isLowerVisualLine(previousTop, nextTop);

const isPointerInLineWrapDescentZone = ({ wordLayout, pointerX, pointerY }) => {
  if (!wordLayout) return false;
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return false;
  if (!Number.isFinite(wordLayout.width) || !Number.isFinite(wordLayout.height)) return false;

  const lowerWordY = wordLayout.top + wordLayout.height * LINE_WRAP_DESCENT_LOWER_WORD_RATIO;
  const transitionX = wordLayout.left + wordLayout.width * LINE_WRAP_DESCENT_RIGHT_EDGE_RATIO;
  return pointerY >= lowerWordY && pointerX >= transitionX;
};

const isLikelyLineWrapDescentBacktrack = ({
  previousTop,
  nextLayout,
  previousPointer,
  pointerX,
  pointerY,
}) => {
  if (!nextLayout) return false;
  if (!isSameVisualLine(previousTop, nextLayout.top)) return false;
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return false;
  if (!Number.isFinite(previousPointer?.x) || !Number.isFinite(previousPointer?.y)) return false;
  if (!Number.isFinite(nextLayout.width) || !Number.isFinite(nextLayout.height)) return false;

  const pointerDeltaX = pointerX - previousPointer.x;
  const pointerDeltaY = pointerY - previousPointer.y;
  return (
    pointerDeltaY >= LINE_WRAP_DESCENT_MIN_VERTICAL_PX &&
    pointerDeltaX <= -LINE_WRAP_DESCENT_MIN_LEFTWARD_PX &&
    isPointerInLineWrapDescentZone({ wordLayout: nextLayout, pointerX, pointerY })
  );
};

const isLikelyLineWrapDescentAnchor = ({ wordLayout, previousPointer, pointerX, pointerY }) => {
  if (!wordLayout) return false;
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return false;
  if (!Number.isFinite(previousPointer?.x) || !Number.isFinite(previousPointer?.y)) return false;
  if (!Number.isFinite(wordLayout.width) || !Number.isFinite(wordLayout.height)) return false;

  const pointerDeltaX = pointerX - previousPointer.x;
  const pointerDeltaY = pointerY - previousPointer.y;
  return (
    pointerDeltaY >= LINE_WRAP_DESCENT_MIN_VERTICAL_PX &&
    pointerDeltaX <= LINE_WRAP_DESCENT_MAX_RIGHTWARD_PX &&
    isPointerInLineWrapDescentZone({ wordLayout, pointerX, pointerY })
  );
};

const isVisualLineEndWord = ({ wordLayout, nextWordLayout }) =>
  isLikelyLineWrapForward({
    previousTop: wordLayout?.top,
    nextTop: nextWordLayout?.top,
    previousLeft: wordLayout?.left,
    nextLeft: nextWordLayout?.left,
  });

const armLineWrapGuard = ({
  signal,
  timestamp,
  anchorWordIndex,
  lineTop,
  extraWordIndexes = [],
}) => {
  const indexes = [anchorWordIndex, ...extraWordIndexes].filter((index) =>
    Number.isInteger(index),
  );
  if (!indexes.length) return;

  const minWordIndex = Math.min(...indexes) - LINE_WRAP_SETTLE_MAX_BACKTRACK_WORDS;
  const maxWordIndex = Math.max(...indexes) + LINE_WRAP_SETTLE_MAX_FORWARD_WORDS;
  const hasActiveGuard =
    Number.isFinite(signal.lineWrapGuardStartedAt) &&
    timestamp - signal.lineWrapGuardStartedAt <= LINE_WRAP_SETTLE_TTL_MS &&
    Number.isInteger(signal.lineWrapGuardMinWordIndex) &&
    Number.isInteger(signal.lineWrapGuardMaxWordIndex);
  const shouldMergeWithActiveGuard =
    hasActiveGuard &&
    indexes.some(
      (index) =>
        index >= signal.lineWrapGuardMinWordIndex &&
        index <= signal.lineWrapGuardMaxWordIndex,
    );

  signal.lineWrapGuardStartedAt = timestamp;
  signal.lineWrapGuardMinWordIndex = shouldMergeWithActiveGuard
    ? Math.min(signal.lineWrapGuardMinWordIndex, minWordIndex)
    : minWordIndex;
  signal.lineWrapGuardMaxWordIndex = shouldMergeWithActiveGuard
    ? Math.max(signal.lineWrapGuardMaxWordIndex, maxWordIndex)
    : maxWordIndex;
  signal.lineWrapGuardLineTop = Number.isFinite(lineTop) ? lineTop : null;
};

const clearRegressionDuringLineWrapGuard = (signal) => {
  resetRegressionSignal(signal);
  resetLoopSignal(signal);
};

const resetDwellSignal = ({ signal, wordIndex, x, y, timestamp, markMotion = false }) => {
  signal.dwellWordIndex = wordIndex;
  signal.dwellStartedAt = timestamp;
  signal.dwellX = x;
  signal.dwellY = y;
  signal.dwellLastX = x;
  signal.dwellLastY = y;
  signal.dwellMotionDistance = 0;
  signal.dwellLastMotionAt = markMotion ? timestamp : null;
  signal.dwellReadyAt = null;
};

const resolveDwellStationaryStartedAt = (signal) => {
  if (!Number.isFinite(signal.dwellStartedAt)) return null;
  if (!Number.isFinite(signal.dwellLastMotionAt)) return signal.dwellStartedAt;
  return Math.max(signal.dwellStartedAt, signal.dwellLastMotionAt);
};

const computePointerDistance = (left, right) => {
  if (!Number.isFinite(left?.x) || !Number.isFinite(left?.y)) return 0;
  if (!Number.isFinite(right?.x) || !Number.isFinite(right?.y)) return 0;
  return Math.hypot(right.x - left.x, right.y - left.y);
};

const countDirectionChanges = (points) => {
  let changes = 0;
  let previousVector = null;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const vector = {
      x: current.x - previous.x,
      y: current.y - previous.y,
    };
    const magnitude = Math.hypot(vector.x, vector.y);
    if (magnitude < 8) continue;

    if (previousVector) {
      const previousMagnitude = Math.hypot(previousVector.x, previousVector.y);
      if (previousMagnitude >= 8) {
        const cosine =
          (previousVector.x * vector.x + previousVector.y * vector.y) /
          (previousMagnitude * magnitude);
        if (cosine <= -0.2) {
          changes += 1;
        }
      }
    }

    previousVector = vector;
  }

  return changes;
};

const summarizeWordMovement = (points) => {
  let backtrackSteps = 0;
  let orderedForwardSteps = 0;
  let transitions = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].wordIndex;
    const current = points[index].wordIndex;
    if (!Number.isInteger(previous) || !Number.isInteger(current) || previous === current) {
      continue;
    }

    transitions += 1;
    const delta = current - previous;
    if (delta < 0) backtrackSteps += 1;
    if (delta === 1) orderedForwardSteps += 1;
  }

  return {
    backtrackSteps,
    orderedForwardRatio: transitions > 0 ? orderedForwardSteps / transitions : 0,
  };
};

const summarizeErraticPointerWindow = (points) => {
  if (points.length < 2) {
    return {
      pathLength: 0,
      displacement: 0,
      pathEfficiency: 1,
      durationMs: 0,
      meanSpeed: 0,
      peakSpeed: 0,
      directionChanges: 0,
      backtrackSteps: 0,
      orderedForwardRatio: 0,
    };
  }

  let pathLength = 0;
  let peakSpeed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const distance = computePointerDistance(previous, current);
    const duration = current.timestamp - previous.timestamp;
    pathLength += distance;
    if (duration > 0) {
      peakSpeed = Math.max(peakSpeed, distance / duration);
    }
  }

  const first = points[0];
  const last = points[points.length - 1];
  const displacement = computePointerDistance(first, last);
  const durationMs = Math.max(0, last.timestamp - first.timestamp);
  const wordMovement = summarizeWordMovement(points);

  return {
    pathLength,
    displacement,
    pathEfficiency: pathLength > 0 ? displacement / pathLength : 1,
    durationMs,
    meanSpeed: durationMs > 0 ? pathLength / durationMs : 0,
    peakSpeed,
    directionChanges: countDirectionChanges(points),
    backtrackSteps: wordMovement.backtrackSteps,
    orderedForwardRatio: wordMovement.orderedForwardRatio,
  };
};

const isWordInsideLineWrapGuard = ({ signal, wordIndex, timestamp }) => {
  if (!Number.isInteger(wordIndex) || wordIndex < 0) return false;
  if (!Number.isFinite(signal.lineWrapGuardStartedAt)) return false;
  if (!Number.isInteger(signal.lineWrapGuardMinWordIndex)) return false;
  if (!Number.isInteger(signal.lineWrapGuardMaxWordIndex)) return false;
  if (timestamp - signal.lineWrapGuardStartedAt > LINE_WRAP_SETTLE_TTL_MS) return false;

  return (
    wordIndex >= signal.lineWrapGuardMinWordIndex &&
    wordIndex <= signal.lineWrapGuardMaxWordIndex
  );
};

const resolveLocalRegressionType = ({ signal, requestedType, backtrackDelta }) => {
  const explicitType = normalizeRegressionTypeValue(requestedType);
  if (explicitType) return explicitType;
  if (signal.loopDirectionChanges >= LOOP_MIN_DIRECTION_CHANGES) return "LOOP";
  if (backtrackDelta >= 4) return "STRONG";
  return "MILD";
};

const resolveLocalFocusRadius = ({ regressionType, requestedFocusRadius, backtrackDelta }) => {
  const parsedFocusRadius = toIntegerOrNull(requestedFocusRadius);
  if (parsedFocusRadius !== null && parsedFocusRadius >= 0) return parsedFocusRadius;
  if (regressionType === "LOOP") return 3;
  if (regressionType === "STRONG") return Math.max(1, backtrackDelta - 1);
  return 0;
};

const useReadingDualInterventionSession = ({
  enabled,
  contentId,
  apiBaseUrl,
  trackingBaseUrl,
  pageKey,
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  fluentTimeoutMs = DEFAULT_FLUENT_TIMEOUT_MS,
  onAdaptationState,
}) => {
  const socketRef = useRef(null);
  const pointBufferRef = useRef([]);
  const flushTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const closeIntentRef = useRef(false);
  const lastEarlyFlushAtRef = useRef(0);
  const dwellTimerRef = useRef(null);
  const socketOpenedAtRef = useRef(0);
  const sessionStartStrategyRef = useRef(0);
  const handshakeVariantRef = useRef(0);
  const pendingAdaptationRef = useRef(null);
  const pageKeyRef = useRef(String(pageKey ?? ""));
  const pageChangedAtRef = useRef(0);
  const hasPointerOnCurrentPageRef = useRef(false);
  const observedWordIndexesOnPageRef = useRef(new Set());
  const pointStatsRef = useRef({
    withWordIndex: 0,
    withoutWordIndex: 0,
    syntheticPoints: 0,
  });
  const localFallbackAllowedRef = useRef(false);
  const localFallbackSignalRef = useRef(createInitialLocalFallbackSignal());
  const lastPointerRef = useRef({
    x: null,
    y: null,
    inside: false,
  });
  const fluentTimerRef = useRef(null);
  const distractionTimerRef = useRef(null);
  const currentWordIndexRef = useRef(null);
  // Track từ đang được can thiệp hiện tại — dùng để cho phép interrupt cooldown
  // khi signal mới nhắm vào một từ khác hẳn từ đang active.
  const activeInterventionWordIndexRef = useRef(null);
  const activeInterventionStateRef = useRef(ADAPTATION_STATES.FLUENT);
  const activeInterventionModeRef = useRef(null);
  const onAdaptationStateRef = useRef(onAdaptationState);
  const sessionIdRef = useRef("");

  const [visualFlags, setVisualFlags] = useState(INITIAL_VISUAL_FLAGS);
  const [wordIntervention, setWordIntervention] = useState(INITIAL_WORD_INTERVENTION);
  const [trackingDebug, setTrackingDebug] = useState(INITIAL_TRACKING_DEBUG);

  useEffect(() => {
    onAdaptationStateRef.current = onAdaptationState;
  }, [onAdaptationState]);

  const markDebug = useCallback((patch) => {
    scheduleMicrotask(() => {
      setTrackingDebug((previous) => ({
        ...previous,
        ...patch,
        lastUpdateAt: Date.now(),
      }));
    });
  }, []);

  const emitAdaptationState = useCallback(
    (payload, { source = "backend", reason = "" } = {}) => {
      const callback = onAdaptationStateRef.current;
      if (typeof callback !== "function") return;

      try {
        callback({
          ...(payload || {}),
          source,
          reason: reason || "",
          sessionId: sessionIdRef.current,
          contentId: contentId ?? null,
          timestamp: Date.now(),
        });
      } catch {
        // ignore consumer errors
      }
    },
    [contentId],
  );

  const countOutbound = useCallback((eventName, metadata = {}) => {
    setTrackingDebug((previous) => {
      const counterKey = OUTBOUND_EVENT_MAP[eventName] || "unknown";
      const nextOutbound = {
        ...previous.outbound,
        [counterKey]: previous.outbound[counterKey] + 1,
      };

      const batchSize = Number.isInteger(metadata.batchSize)
        ? metadata.batchSize
        : previous.lastBatchSize;
      const isBatchEvent = eventName === "mouse:batch";

      return {
        ...previous,
        outbound: nextOutbound,
        lastOutboundEvent: eventName,
        lastBatchSize: batchSize,
        totalBatchesSent: isBatchEvent ? previous.totalBatchesSent + 1 : previous.totalBatchesSent,
        totalPointsSent: isBatchEvent
          ? previous.totalPointsSent + (Number.isInteger(batchSize) ? batchSize : 0)
          : previous.totalPointsSent,
        bufferedPoints: pointBufferRef.current.length,
        lastUpdateAt: Date.now(),
      };
    });
  }, []);

  const countInbound = useCallback((eventType, rawEventName = "") => {
    setTrackingDebug((previous) => {
      const counterKey = INBOUND_EVENT_MAP[eventType] || "ignored";
      return {
        ...previous,
        inbound: {
          ...previous.inbound,
          [counterKey]: previous.inbound[counterKey] + 1,
        },
        lastInboundEvent: rawEventName || eventType,
        lastUpdateAt: Date.now(),
      };
    });
  }, []);

  const countDisabledTooltipInbound = useCallback(() => {
    setTrackingDebug((previous) => ({
      ...previous,
      inbound: {
        ...previous.inbound,
        tooltip: previous.inbound.tooltip + 1,
      },
      lastUpdateAt: Date.now(),
    }));
  }, []);

  const clearFlushTimer = useCallback(() => {
    if (!flushTimerRef.current) return;
    window.clearInterval(flushTimerRef.current);
    flushTimerRef.current = null;
  }, []);

  const clearFluentTimer = useCallback(() => {
    if (!fluentTimerRef.current) return;
    window.clearTimeout(fluentTimerRef.current);
    fluentTimerRef.current = null;
  }, []);

  const clearDistractionTimer = useCallback(() => {
    if (!distractionTimerRef.current) return;
    window.clearTimeout(distractionTimerRef.current);
    distractionTimerRef.current = null;
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimerRef.current) return;
    window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const clearDwellTimer = useCallback(() => {
    if (!dwellTimerRef.current) return;
    window.clearInterval(dwellTimerRef.current);
    dwellTimerRef.current = null;
  }, []);

  const sendEvent = useCallback((payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  const sendTrackedEvent = useCallback(
    (payload, metadata = {}) => {
      if (!payload?.event) return false;

      const sent = sendEvent(payload);
      if (sent) {
        countOutbound(payload.event, metadata);
      }
      return sent;
    },
    [countOutbound, sendEvent],
  );

  const resetFluentUi = useCallback(() => {
    pendingAdaptationRef.current = null;
    activeInterventionWordIndexRef.current = null;
    activeInterventionStateRef.current = ADAPTATION_STATES.FLUENT;
    activeInterventionModeRef.current = null;
    setVisualFlags(INITIAL_VISUAL_FLAGS);
    setWordIntervention(INITIAL_WORD_INTERVENTION);
    markDebug({
      localFallbackActive: false,
      localFallbackReason: "",
      localFallbackWordIndex: null,
    });
  }, [markDebug]);

  const resetLocalFallbackSignal = useCallback(() => {
    localFallbackSignalRef.current = createInitialLocalFallbackSignal(
      localFallbackSignalRef.current.lastTriggeredAt,
    );
  }, []);

  useLayoutEffect(() => {
    const nextPageKey = String(pageKey ?? "");
    if (pageKeyRef.current === nextPageKey) return;

    pageKeyRef.current = nextPageKey;
    pageChangedAtRef.current = Date.now();
    hasPointerOnCurrentPageRef.current = false;
    observedWordIndexesOnPageRef.current = new Set();
    currentWordIndexRef.current = null;
    pendingAdaptationRef.current = null;
    activeInterventionWordIndexRef.current = null;
    activeInterventionStateRef.current = ADAPTATION_STATES.FLUENT;
    activeInterventionModeRef.current = null;
    pointBufferRef.current = [];
    lastPointerRef.current = {
      x: null,
      y: null,
      inside: false,
    };

    clearFluentTimer();
    clearDistractionTimer();
    resetLocalFallbackSignal();
    setVisualFlags(INITIAL_VISUAL_FLAGS);
    setWordIntervention(INITIAL_WORD_INTERVENTION);
    markDebug({
      bufferedPoints: 0,
      localFallbackActive: false,
      localFallbackReason: "",
      localFallbackWordIndex: null,
    });
  }, [clearDistractionTimer, clearFluentTimer, markDebug, pageKey, resetLocalFallbackSignal]);

  const armFluentTimer = useCallback(() => {
    clearFluentTimer();

    fluentTimerRef.current = window.setTimeout(() => {
      resetFluentUi();
    }, fluentTimeoutMs);
  }, [clearFluentTimer, fluentTimeoutMs, resetFluentUi]);

  const appendTrackingPoint = useCallback(
    ({ x, y, timestamp = Date.now(), wordIndex, isSynthetic = false }) => {
      pointBufferRef.current.push(
        createTrackingPoint({
          x,
          y,
          timestamp,
          wordIndex,
        }),
      );

      if (Number.isInteger(wordIndex)) {
        pointStatsRef.current.withWordIndex += 1;
      } else {
        pointStatsRef.current.withoutWordIndex += 1;
      }

      if (isSynthetic) {
        pointStatsRef.current.syntheticPoints += 1;
      }

      const bufferedPoints = pointBufferRef.current.length;
      if (bufferedPoints === 1 || bufferedPoints % 25 === 0) {
        markDebug({
          bufferedPoints,
          pointsWithWordIndex: pointStatsRef.current.withWordIndex,
          pointsWithoutWordIndex: pointStatsRef.current.withoutWordIndex,
          syntheticPoints: pointStatsRef.current.syntheticPoints,
        });
      }

      if (bufferedPoints > 5000) {
        pointBufferRef.current.shift();
        markDebug({ bufferedPoints: pointBufferRef.current.length });
      }
    },
    [markDebug],
  );

  const flushPoints = useCallback(() => {
    if (pointBufferRef.current.length === 0) return;

    const points = pointBufferRef.current;
    const sent = sendTrackedEvent(createMouseBatchEvent(points), {
      batchSize: points.length,
    });

    if (sent) {
      pointBufferRef.current = [];
      markDebug({ bufferedPoints: 0 });
    }
  }, [markDebug, sendTrackedEvent]);

  const buildSocketUrlForVariant = useCallback(
    ({ token }) => {
      const resolved = resolveTrackingSocketUrl({
        trackingBaseUrl,
        apiBaseUrl,
        token,
      });
      const parsed = new URL(resolved);

      parsed.pathname = "/tracking";
      parsed.search = "";
      parsed.searchParams.set("token", token);

      return parsed.toString();
    },
    [apiBaseUrl, trackingBaseUrl],
  );

  const createAuthBootstrapEvents = useCallback(() => [], []);

  const triggerLocalFallbackIntervention = useCallback(
    ({
      wordIndex,
      reason,
      state = ADAPTATION_STATES.REGRESSION,
      regressionType,
      regressionFocusRadius,
    }) => {
      if (!localFallbackAllowedRef.current) return;

      const now = Date.now();
      const signal = localFallbackSignalRef.current;
      const resolvedWordIndex = Number.isInteger(wordIndex) && wordIndex >= 0 ? wordIndex : null;
      const isRegressionState = state === ADAPTATION_STATES.REGRESSION;
      const fallbackMode = isRegressionState ? "DUAL_INTERVENTION" : "VISUAL_ONLY";

      if (
        activeInterventionStateRef.current === state &&
        activeInterventionModeRef.current === fallbackMode &&
        activeInterventionWordIndexRef.current === resolvedWordIndex
      ) {
        return;
      }

      if (
        isRegressionState &&
        isWordInsideLineWrapGuard({
          signal,
          wordIndex: resolvedWordIndex,
          timestamp: now,
        })
      ) {
        return;
      }

      const timeSinceLast = now - signal.lastTriggeredAt;

      // Cho phép interrupt sớm nếu signal mới nhắm vào từ khác hẳn từ đang active —
      // giữ min 800ms để tránh flicker khi chuột đi qua liên tục.
      // Nếu cùng từ thì vẫn giữ cooldown đầy đủ để tránh re-trigger dư thừa.
      const isDifferentWord =
        resolvedWordIndex !== null &&
        resolvedWordIndex !== activeInterventionWordIndexRef.current;
      const cooldownPassed = timeSinceLast >= LOCAL_FALLBACK_COOLDOWN_MS;
      const allowEarlyInterrupt =
        isDifferentWord && timeSinceLast >= LOCAL_FALLBACK_INTERRUPT_GAP_MS;

      if (!cooldownPassed && !allowEarlyInterrupt) return;

      signal.lastTriggeredAt = now;

      const fallbackParams = isRegressionState
        ? {
            letterSpacing: 0.094,
            transitionMs: 130,
            colorBandingStrength: 0.24,
            invertedDeep: true,
            invertedStrength: 0.9,
            contrastBoost: 1.22,
          }
        : {
            letterSpacing: 0.058,
            transitionMs: 160,
            colorBandingStrength: 0.16,
            invertedDeep: false,
            invertedStrength: 0,
            contrastBoost: 1.08,
          };

      setVisualFlags(
        createVisualFlagsFromAdaptation({
          state,
          mode: fallbackMode,
          confidence: 0.88,
          params: {
            ...fallbackParams,
          },
        }),
      );

      // resolvedWordIndex đã được khai báo ở đầu hàm (trước cooldown check).

      // Classify LOOP nếu có đủ direction changes (di qua lại vùng hẹp),
      // còn lại là STRONG/MILD dựa trên backtrackDelta.
      const backtrackDelta =
        Number.isInteger(signal.regressionStartWordIndex) &&
          Number.isInteger(signal.regressionLowestWordIndex)
          ? signal.regressionStartWordIndex - signal.regressionLowestWordIndex
          : 0;

      const localRegressionType = resolveLocalRegressionType({
        signal,
        requestedType: regressionType,
        backtrackDelta,
      });
      const localFocusRadius = resolveLocalFocusRadius({
        regressionType: localRegressionType,
        requestedFocusRadius: regressionFocusRadius,
        backtrackDelta,
      });

      emitAdaptationState(
        {
          state,
          mode: fallbackMode,
          adaptationType: "LOCAL_FALLBACK",
          confidence: 0.88,
          params: {
            ...fallbackParams,
          },
          wordIndex: resolvedWordIndex,
        },
        {
          source: "local-fallback",
          reason: reason || "local-fallback",
        },
      );

      // console.log("[FallbackTrigger]", Date.now(), {
      //   reason,
      //   wordIndex,
      //   regressionDurationMs: Date.now() - (localFallbackSignalRef.current.regressionStartedAt ?? Date.now()),
      //   totalBacktrackDelta:
      //     (localFallbackSignalRef.current.regressionStartWordIndex ?? 0) -
      //     (localFallbackSignalRef.current.regressionLowestWordIndex ?? 0),
      //   stepCount: localFallbackSignalRef.current.regressionStepCount,
      //   timeSinceLastTrigger: Date.now() - localFallbackSignalRef.current.lastTriggeredAt,
      // });

      activeInterventionWordIndexRef.current = resolvedWordIndex;
      activeInterventionStateRef.current = state;
      activeInterventionModeRef.current = fallbackMode;
      setWordIntervention((previous) => ({
        ...previous,
        distractionWordIndex: state === ADAPTATION_STATES.DISTRACTION ? resolvedWordIndex : null,
        regressionWordIndex: isRegressionState ? resolvedWordIndex : null,
        regressionType: isRegressionState ? localRegressionType : null,
        regressionFocusRadius: isRegressionState ? localFocusRadius : 0,
        semanticWordIndex: null,
      }));

      setTrackingDebug((previous) => ({
        ...previous,
        localFallbackInterventions: previous.localFallbackInterventions + 1,
        localFallbackActive: true,
        localFallbackReason: reason || "local-fallback",
        localFallbackWordIndex: resolvedWordIndex,
        lastUpdateAt: Date.now(),
      }));

      armFluentTimer();
    },
    [armFluentTimer, emitAdaptationState],
  );

  const evaluateRegressionFallbackByWordIndex = useCallback(
    ({ wordIndex, timestamp, wordElement, wordLayout, pointerX, pointerY, previousPointer }) => {
      if (!Number.isInteger(wordIndex) || wordIndex < 0) return false;

      const signal = localFallbackSignalRef.current;
      let isRegressionReady = false;
      const nextWordLayout = getAdjacentWordLayoutSnapshot(wordElement, wordIndex, 1);
      const previousWordLayout = getAdjacentWordLayoutSnapshot(wordElement, wordIndex, -1);

      if (
        Number.isFinite(signal.lastObservedAt) &&
        timestamp - signal.lastObservedAt > LOCAL_FALLBACK_SIGNAL_RESET_MS
      ) {
        resetRegressionSignal(signal);
        resetLoopSignal(signal);
        resetLineWrapGuard(signal);
      }

      if (
        Number.isFinite(signal.lineWrapGuardStartedAt) &&
        timestamp - signal.lineWrapGuardStartedAt > LINE_WRAP_SETTLE_TTL_MS
      ) {
        resetLineWrapGuard(signal);
      }

      const isLineEndDescentAnchor =
        isVisualLineEndWord({ wordLayout, nextWordLayout }) &&
        isPointerInLineWrapDescentZone({ wordLayout, pointerX, pointerY });

      if (isLineEndDescentAnchor) {
        armLineWrapGuard({
          signal,
          timestamp,
          anchorWordIndex: wordIndex,
          lineTop: wordLayout?.top,
          extraWordIndexes: [wordIndex + 1],
        });
      }

      if (Number.isInteger(signal.lastWordIndex)) {
        const wordDelta = wordIndex - signal.lastWordIndex;
        const didMoveToLowerVisualLine = isForwardLowerLineTransition({
          wordDelta,
          previousTop: signal.lastWordLayoutTop,
          nextTop: wordLayout?.top,
        });
        const isLineWrapDescentBacktrack =
          wordDelta < 0 &&
          signal.lastWordIndex - wordIndex <= LINE_WRAP_SETTLE_MAX_BACKTRACK_WORDS &&
          isLikelyLineWrapDescentBacktrack({
            previousTop: signal.lastWordLayoutTop,
            nextLayout: wordLayout,
            previousPointer,
            pointerX,
            pointerY,
          });
        const isLineWrapDescentAnchor =
          wordDelta === 0 &&
          (isLineEndDescentAnchor ||
            isLikelyLineWrapDescentAnchor({
              wordLayout,
              previousPointer,
              pointerX,
              pointerY,
            }));
        const isLineWrapGuardedBacktrack =
          isWordInsideLineWrapGuard({ signal, wordIndex, timestamp }) &&
          (isSameVisualLine(signal.lineWrapGuardLineTop, wordLayout?.top) ||
            isSameVisualLine(signal.lineWrapGuardLineTop, previousWordLayout?.top) ||
            isSameVisualLine(signal.lineWrapGuardLineTop, nextWordLayout?.top));

        if (wordDelta <= -LOCAL_FALLBACK_REGRESSION_MIN_STEP_DELTA) {
          if (isLineWrapGuardedBacktrack || isLineWrapDescentBacktrack) {
            if (isLineWrapDescentBacktrack) {
              armLineWrapGuard({
                signal,
                timestamp,
                anchorWordIndex: signal.lastWordIndex,
                lineTop: wordLayout?.top,
                extraWordIndexes: [wordIndex],
              });
            }
            clearRegressionDuringLineWrapGuard(signal);
            if (pendingAdaptationRef.current?.payload?.state === ADAPTATION_STATES.REGRESSION) {
              pendingAdaptationRef.current = null;
            }
          } else {
            // --- LOOP tracking: đổi chiều backward ---
            if (signal.loopLastDirection === "forward") {
              // Vừa tiến xong giờ lùi = 1 lần đổi chiều
              const currentZoneWidth =
                Number.isInteger(signal.loopZoneMin) && Number.isInteger(signal.loopZoneMax)
                  ? signal.loopZoneMax - signal.loopZoneMin
                  : 0;
              if (currentZoneWidth <= LOOP_ZONE_WIDTH) {
                signal.loopDirectionChanges += 1;
              } else {
                // Vùng quá rộng — không phải loop, reset
                resetLoopSignal(signal);
              }
            }
            signal.loopLastDirection = "backward";
            if (signal.loopStartedAt === null) signal.loopStartedAt = timestamp;
            signal.loopZoneMin = Number.isInteger(signal.loopZoneMin)
              ? Math.min(signal.loopZoneMin, wordIndex)
              : wordIndex;
            signal.loopZoneMax = Number.isInteger(signal.loopZoneMax)
              ? Math.max(signal.loopZoneMax, signal.lastWordIndex)
              : signal.lastWordIndex;

            // --- Regression tracking ---
            const backwardGapMs = Number.isFinite(signal.regressionLastBackwardAt)
              ? timestamp - signal.regressionLastBackwardAt
              : 0;
            const shouldStartRegressionRun =
              signal.regressionStartedAt === null ||
              backwardGapMs > LOCAL_FALLBACK_REGRESSION_MAX_GAP_MS ||
              !Number.isInteger(signal.regressionStartWordIndex);

            if (shouldStartRegressionRun) {
              signal.regressionStartedAt = Number.isFinite(signal.lastObservedAt)
                ? signal.lastObservedAt
                : timestamp;
              signal.regressionStartWordIndex = signal.lastWordIndex;
              signal.regressionLowestWordIndex = wordIndex;
              signal.regressionStepCount = 1;
            } else {
              signal.regressionLowestWordIndex = Math.min(
                signal.regressionLowestWordIndex,
                wordIndex,
              );
              signal.regressionStepCount += 1;
            }

            signal.regressionLastBackwardAt = timestamp;

            const regressionDurationMs = timestamp - signal.regressionStartedAt;
            const totalBacktrackDelta =
              signal.regressionStartWordIndex - signal.regressionLowestWordIndex;

            // OVERSHOOT GUARD: khi wrap dòng, chuột thường landing overshoot vào word
            // cao hơn đích (ví dụ 24/25) rồi kéo nhanh về đầu dòng mới (22).
            // Pattern này xảy ra rất nhanh (< 600ms), ít bước (≤ 2), lùi không nhiều (≤ 4 từ).
            // Regression thật của trẻ chậm hơn và có nhiều bước lùi hơn.
            const isLikelyLineWrapOvershoot =
              regressionDurationMs < 600 &&
              totalBacktrackDelta <= 4 &&
              signal.regressionStepCount <= 2;

            if (isLikelyLineWrapOvershoot) {
              // Reset cả regression lẫn loop để tránh stepCount cộng dồn sai
              resetRegressionSignal(signal);
              resetLoopSignal(signal);
            }

            const hasSustainedRegression =
              !isLikelyLineWrapOvershoot &&
              regressionDurationMs > LOCAL_FALLBACK_REGRESSION_MIN_DURATION_MS &&
              totalBacktrackDelta >= LOCAL_FALLBACK_REGRESSION_MIN_TOTAL_DELTA &&
              signal.regressionStepCount >= LOCAL_FALLBACK_REGRESSION_MIN_EVENTS;

            // LOOP fire độc lập với hasSustainedRegression —
            // không cần đủ duration/delta, chỉ cần đủ direction changes.
            const hasLoopPattern =
              !isLikelyLineWrapOvershoot &&
              signal.loopDirectionChanges >= LOOP_MIN_DIRECTION_CHANGES;

            if (hasLoopPattern) {
              isRegressionReady = true;
              signal.regressionReadyAt = timestamp;
              signal.regressionReadyWordIndex = wordIndex;
              resetRegressionSignal(signal, { clearReadiness: false });
              resetLoopSignal(signal);
              if (localFallbackAllowedRef.current) {
                triggerLocalFallbackIntervention({
                  wordIndex,
                  reason: "local-loop-oscillation",
                  regressionType: "LOOP",
                  regressionFocusRadius: 3,
                });
              }
            } else if (hasSustainedRegression) {
              const sustainedRegressionType = totalBacktrackDelta >= 4 ? "STRONG" : "MILD";
              const sustainedFocusRadius =
                sustainedRegressionType === "STRONG"
                  ? Math.max(1, totalBacktrackDelta - 1)
                  : 0;

              isRegressionReady = true;
              signal.regressionReadyAt = timestamp;
              signal.regressionReadyWordIndex = wordIndex;
              resetRegressionSignal(signal, { clearReadiness: false });
              resetLoopSignal(signal);
              if (localFallbackAllowedRef.current) {
                triggerLocalFallbackIntervention({
                  wordIndex,
                  reason: "local-regression-backtrack",
                  regressionType: sustainedRegressionType,
                  regressionFocusRadius: sustainedFocusRadius,
                });
              }
            }
          }
        } else if (isLineWrapDescentAnchor) {
          armLineWrapGuard({
            signal,
            timestamp,
            anchorWordIndex: wordIndex,
            lineTop: wordLayout?.top,
            extraWordIndexes: [wordIndex + 1],
          });
          clearRegressionDuringLineWrapGuard(signal);
          if (pendingAdaptationRef.current?.payload?.state === ADAPTATION_STATES.REGRESSION) {
            pendingAdaptationRef.current = null;
          }
        } else if (wordDelta > 0) {
          // --- LOOP tracking: đổi chiều forward ---
          if (signal.loopLastDirection === "backward") {
            const currentZoneWidth =
              Number.isInteger(signal.loopZoneMin) && Number.isInteger(signal.loopZoneMax)
                ? signal.loopZoneMax - signal.loopZoneMin
                : 0;
            if (currentZoneWidth <= LOOP_ZONE_WIDTH) {
              signal.loopDirectionChanges += 1;
            } else {
              resetLoopSignal(signal);
            }
          }
          signal.loopLastDirection = "forward";
          signal.loopZoneMax = Number.isInteger(signal.loopZoneMax)
            ? Math.max(signal.loopZoneMax, wordIndex)
            : wordIndex;

          if (didMoveToLowerVisualLine) {
            armLineWrapGuard({
              signal,
              timestamp,
              anchorWordIndex: wordIndex,
              lineTop: wordLayout?.top,
              extraWordIndexes: [signal.lastWordIndex],
            });
          }

          // Tiến ra ngoài vùng loop → reset loop
          if (
            Number.isInteger(signal.loopZoneMin) &&
            Number.isInteger(signal.loopZoneMax) &&
            signal.loopZoneMax - signal.loopZoneMin > LOOP_ZONE_WIDTH
          ) {
            resetLoopSignal(signal);
          }

          // Tiến → reset regression (hành vi bình thường)
          resetRegressionSignal(signal);
          if (pendingAdaptationRef.current?.payload?.state === ADAPTATION_STATES.REGRESSION) {
            pendingAdaptationRef.current = null;
          }
        } else if (
          Number.isFinite(signal.regressionLastBackwardAt) &&
          timestamp - signal.regressionLastBackwardAt > LOCAL_FALLBACK_REGRESSION_MAX_GAP_MS
        ) {
          resetRegressionSignal(signal);
          if (pendingAdaptationRef.current?.payload?.state === ADAPTATION_STATES.REGRESSION) {
            pendingAdaptationRef.current = null;
          }
        }
      }

      signal.lastWordIndex = wordIndex;
      signal.lastObservedAt = timestamp;
      signal.lastWordLayoutTop = Number.isFinite(wordLayout?.top) ? wordLayout.top : null;
      signal.lastWordLayoutLeft = Number.isFinite(wordLayout?.left) ? wordLayout.left : null;
      return isRegressionReady;
    },
    [triggerLocalFallbackIntervention],
  );

  const evaluateDwellFallbackByPointer = useCallback(
    ({ wordIndex, x, y, timestamp, shouldTrigger }) => {
      if (!Number.isInteger(wordIndex) || wordIndex < 0) return false;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

      const signal = localFallbackSignalRef.current;
      const hasDwellAnchor = Number.isFinite(signal.dwellX) && Number.isFinite(signal.dwellY);
      const hasLastDwellPoint =
        Number.isFinite(signal.dwellLastX) && Number.isFinite(signal.dwellLastY);
      const pointerDistance = hasDwellAnchor
        ? Math.hypot(x - signal.dwellX, y - signal.dwellY)
        : 0;
      const stepDistance =
        signal.dwellWordIndex === wordIndex && hasLastDwellPoint
          ? Math.hypot(x - signal.dwellLastX, y - signal.dwellLastY)
          : 0;
      const isIntentionalInWordMotion =
        signal.dwellWordIndex === wordIndex &&
        stepDistance >= LOCAL_FALLBACK_DWELL_MOTION_STEP_PX;
      const nextMotionDistance = isIntentionalInWordMotion
        ? signal.dwellMotionDistance + stepDistance
        : signal.dwellMotionDistance;
      const shouldResetDwell =
        signal.dwellWordIndex !== wordIndex ||
        !hasDwellAnchor ||
        pointerDistance > LOCAL_FALLBACK_DWELL_POINTER_TOLERANCE_PX ||
        nextMotionDistance >= LOCAL_FALLBACK_DWELL_MOTION_RESET_PX;

      if (shouldResetDwell) {
        resetDwellSignal({
          signal,
          wordIndex,
          x,
          y,
          timestamp,
          markMotion: isIntentionalInWordMotion || hasDwellAnchor,
        });
        if (pendingAdaptationRef.current?.payload?.state === ADAPTATION_STATES.DISTRACTION) {
          pendingAdaptationRef.current = null;
        }
        return false;
      }

      if (isIntentionalInWordMotion) {
        signal.dwellLastX = x;
        signal.dwellLastY = y;
        signal.dwellMotionDistance = nextMotionDistance;
        signal.dwellLastMotionAt = timestamp;
        if (pendingAdaptationRef.current?.payload?.state === ADAPTATION_STATES.DISTRACTION) {
          pendingAdaptationRef.current = null;
        }
      }

      const stationaryStartedAt = resolveDwellStationaryStartedAt(signal);
      if (!shouldTrigger || !Number.isFinite(stationaryStartedAt)) {
        return false;
      }

      const dwellDurationMs = timestamp - stationaryStartedAt;
      if (dwellDurationMs < LOCAL_FALLBACK_DWELL_MIN_MS) {
        return false;
      }

      signal.dwellStartedAt = timestamp;
      signal.dwellX = x;
      signal.dwellY = y;
      signal.dwellLastX = x;
      signal.dwellLastY = y;
      signal.dwellMotionDistance = 0;
      signal.dwellLastMotionAt = null;
      signal.dwellReadyAt = timestamp;
      if (localFallbackAllowedRef.current) {
        triggerLocalFallbackIntervention({
          wordIndex,
          reason: "local-dwell-stall",
          state: ADAPTATION_STATES.REGRESSION,
          regressionType: "STALL",
        });
      }
      return true;
    },
    [triggerLocalFallbackIntervention],
  );

  const evaluateErraticDistractionFallbackByPointer = useCallback(
    ({ wordIndex, x, y, timestamp }) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

      const signal = localFallbackSignalRef.current;
      const nextPoint = {
        x,
        y,
        timestamp,
        wordIndex: Number.isInteger(wordIndex) && wordIndex >= 0 ? wordIndex : null,
      };

      signal.erraticPoints = [...(signal.erraticPoints || []), nextPoint].filter(
        (point) => timestamp - point.timestamp <= LOCAL_FALLBACK_ERRATIC_WINDOW_MS,
      );

      if (signal.erraticPoints.length < LOCAL_FALLBACK_ERRATIC_MIN_POINTS) {
        return false;
      }

      const summary = summarizeErraticPointerWindow(signal.erraticPoints);
      const hasErraticPointerPath =
        summary.pathLength >= LOCAL_FALLBACK_ERRATIC_MIN_PATH_PX &&
        summary.directionChanges >= LOCAL_FALLBACK_ERRATIC_MIN_DIRECTION_CHANGES &&
        summary.pathEfficiency <= LOCAL_FALLBACK_ERRATIC_MAX_PATH_EFFICIENCY &&
        (summary.meanSpeed >= LOCAL_FALLBACK_ERRATIC_MIN_MEAN_SPEED_PX_MS ||
          summary.peakSpeed >= LOCAL_FALLBACK_ERRATIC_MIN_PEAK_SPEED_PX_MS);
      const isLikelyReadingOrder =
        summary.orderedForwardRatio > LOCAL_FALLBACK_ERRATIC_MAX_ORDERED_FORWARD_RATIO;
      if (!hasErraticPointerPath || isLikelyReadingOrder) {
        return false;
      }

      signal.erraticReadyAt = timestamp;
      signal.erraticReadyWordIndex = nextPoint.wordIndex;
      resetErraticSignal(signal, { clearReadiness: false });

      if (localFallbackAllowedRef.current) {
        triggerLocalFallbackIntervention({
          wordIndex: nextPoint.wordIndex,
          reason: "local-erratic-movement",
          state: ADAPTATION_STATES.DISTRACTION,
        });
      }

      return true;
    },
    [triggerLocalFallbackIntervention],
  );

  const applyAdaptationPayload = useCallback(
    (payload) => {
      if (!payload) return;

      const now = Date.now();
      const payloadWordIndex = toIntegerOrNull(payload.wordIndex);
      const isNonFluentState = payload.state !== ADAPTATION_STATES.FLUENT;
      const isInsidePageChangeGuard =
        pageChangedAtRef.current > 0 &&
        now - pageChangedAtRef.current < PAGE_CHANGE_STALE_EVENT_GUARD_MS;
      const hasObservedPayloadWordOnPage =
        Number.isInteger(payloadWordIndex) &&
        observedWordIndexesOnPageRef.current.has(payloadWordIndex);

      if (
        isNonFluentState &&
        pageChangedAtRef.current > 0 &&
        (!hasPointerOnCurrentPageRef.current ||
          isInsidePageChangeGuard ||
          !hasObservedPayloadWordOnPage)
      ) {
        return;
      }

      if (
        payload.state === ADAPTATION_STATES.REGRESSION &&
        isWordInsideLineWrapGuard({
          signal: localFallbackSignalRef.current,
          wordIndex: payloadWordIndex,
          timestamp: now,
        })
      ) {
        return;
      }

      emitAdaptationState(payload, { source: "backend" });

      if (payload.state === ADAPTATION_STATES.FLUENT) {
        resetFluentUi();
        clearFluentTimer();
        clearDistractionTimer();
        return;
      }

      if (payload.adaptationType === "SEMANTIC") {
        setTrackingDebug((previous) => ({
          ...previous,
          localFallbackActive: false,
          localFallbackReason: "",
          localFallbackWordIndex: null,
          lastUpdateAt: now,
        }));

        setWordIntervention((previous) => ({
          ...previous,
          semanticWordIndex: payload.wordIndex,
        }));
        armFluentTimer();
        return;
      }

      setVisualFlags(
        createVisualFlagsFromAdaptation({
          state: payload.state,
          mode: payload.mode,
          confidence: payload.confidence,
          params: payload.params,
        }),
      );

      if (payload.state === ADAPTATION_STATES.REGRESSION) {
        // BE only signals state:"REGRESSION" — classify subtype locally from the
        // cursor signal that was already being tracked before BE responded.
        const signal = localFallbackSignalRef.current;
        const backtrackDelta =
          Number.isInteger(signal.regressionStartWordIndex) &&
            Number.isInteger(signal.regressionLowestWordIndex)
            ? signal.regressionStartWordIndex - signal.regressionLowestWordIndex
            : 0;
        const regressionType = normalizeRegressionType(payload);

        const regressionFocusRadius =
          regressionType === "STRONG"
            ? resolveFocusRadius(payload, Math.max(1, backtrackDelta - 1))
            : regressionType === "LOOP"
              ? resolveFocusRadius(payload, 3)
              : resolveFocusRadius(payload, 0);

        setWordIntervention((previous) => ({
          ...previous,
          regressionWordIndex: payloadWordIndex,
          regressionType,
          regressionFocusRadius,
          distractionWordIndex: null,
          semanticWordIndex: null,
        }));
        activeInterventionWordIndexRef.current = payloadWordIndex;
        activeInterventionStateRef.current = payload.state;
        activeInterventionModeRef.current = payload.mode ?? null;
      } else {
        setWordIntervention((previous) => ({
          ...previous,
          regressionWordIndex: null,
          regressionType: null,
          regressionFocusRadius: 0,
          distractionWordIndex:
            payload.state === ADAPTATION_STATES.DISTRACTION ? payloadWordIndex : null,
          semanticWordIndex: null,
        }));
        activeInterventionWordIndexRef.current =
          payload.state === ADAPTATION_STATES.DISTRACTION ? payloadWordIndex : null;
        activeInterventionStateRef.current = payload.state;
        activeInterventionModeRef.current = payload.mode ?? null;
      }

      if (payload.state === ADAPTATION_STATES.DISTRACTION) {
        clearDistractionTimer();
        distractionTimerRef.current = window.setTimeout(() => {
          setWordIntervention((previous) => ({
            ...previous,
            distractionWordIndex: null,
          }));
        }, DISTRACTION_HINT_DURATION_MS);
      }

      setTrackingDebug((previous) => ({
        ...previous,
        localFallbackActive: false,
        localFallbackReason: "",
        localFallbackWordIndex: null,
        lastUpdateAt: Date.now(),
      }));

      armFluentTimer();
    },
    [
      armFluentTimer,
      clearDistractionTimer,
      clearFluentTimer,
      emitAdaptationState,
      resetFluentUi,
    ],
  );

  const isAdaptationBehaviorReady = useCallback((payload, timestamp = Date.now()) => {
    if (!payload) return true;
    if (payload.adaptationType === "SEMANTIC") return true;

    const signal = localFallbackSignalRef.current;

    if (payload.state === ADAPTATION_STATES.DISTRACTION) {
      return true;
    }

    if (payload.state === ADAPTATION_STATES.REGRESSION) {
      return (
        Number.isFinite(signal.regressionReadyAt) &&
        timestamp - signal.regressionReadyAt <= LOCAL_FALLBACK_BEHAVIOR_READY_TTL_MS
      );
    }

    return true;
  }, []);

  const flushPendingAdaptationIfReady = useCallback(
    ({ timestamp = Date.now() } = {}) => {
      const pending = pendingAdaptationRef.current;
      if (!pending?.payload) return false;
      if (!isAdaptationBehaviorReady(pending.payload, timestamp)) return false;

      pendingAdaptationRef.current = null;
      applyAdaptationPayload(pending.payload);
      return true;
    },
    [applyAdaptationPayload, isAdaptationBehaviorReady],
  );

  const shouldDelayAdaptationPayload = useCallback(
    (payload, timestamp = Date.now()) => {
      if (payload?.state !== ADAPTATION_STATES.DISTRACTION) {
        pendingAdaptationRef.current = null;
        return false;
      }

      if (isAdaptationBehaviorReady(payload, timestamp)) {
        return false;
      }

      pendingAdaptationRef.current = {
        payload,
        receivedAt: timestamp,
      };
      return true;
    },
    [isAdaptationBehaviorReady],
  );

  const handleSocketMessage = useCallback(
    (rawData) => {
      const message = parseTrackingSocketMessage(rawData);
      if (!message) {
        countInbound("parseError", "parse_error");
        return;
      }

      const rawEventName =
        String(message?.event || message?.type || message?.name || "unknown").toLowerCase();
      const interpreted = interpretTrackingSocketEvent({
        message,
        currentWordIndex: currentWordIndexRef.current,
      });

      if (interpreted.type === "ignore") {
        countInbound("ignore", rawEventName);
        return;
      }

      if (interpreted.type === "reset") {
        countInbound("reset", rawEventName);
        resetFluentUi();
        clearFluentTimer();
        clearDistractionTimer();
        return;
      }

      if (interpreted.type === "adaptation") {
        countInbound("adaptation", rawEventName);
        if (shouldDelayAdaptationPayload(interpreted.payload)) {
          return;
        }

        applyAdaptationPayload(interpreted.payload);
        return;
      }

      if (interpreted.type === "tooltip") {
        countDisabledTooltipInbound();
        return;
      }
    },
    [
      applyAdaptationPayload,
      countDisabledTooltipInbound,
      countInbound,
      clearDistractionTimer,
      clearFluentTimer,
      resetFluentUi,
      shouldDelayAdaptationPayload,
    ],
  );

  const endSession = useCallback((metadata = {}) => {
    closeIntentRef.current = true;
    clearReconnectTimer();
    clearDwellTimer();

    flushPoints();
    sendTrackedEvent(createSessionEndEvent(metadata));

    clearFlushTimer();
    clearFluentTimer();
    clearDistractionTimer();

    const socket = socketRef.current;
    socketRef.current = null;

    if (socket) {
      try {
        socket.close();
      } catch {
        // no-op
      }
    }

    pointBufferRef.current = [];
    lastPointerRef.current = {
      x: null,
      y: null,
      inside: false,
    };
    pointStatsRef.current = {
      withWordIndex: 0,
      withoutWordIndex: 0,
      syntheticPoints: 0,
    };
    pendingAdaptationRef.current = null;
    localFallbackAllowedRef.current = false;
    localFallbackSignalRef.current = createInitialLocalFallbackSignal();

    resetFluentUi();
  }, [
    clearDwellTimer,
    clearReconnectTimer,
    clearDistractionTimer,
    clearFlushTimer,
    clearFluentTimer,
    flushPoints,
    resetFluentUi,
    sendTrackedEvent,
  ]);

  useEffect(() => {
    if (!enabled) return undefined;

    closeIntentRef.current = false;
    reconnectAttemptRef.current = 0;
    sessionStartStrategyRef.current = 0;
    handshakeVariantRef.current = 0;
    pointStatsRef.current = {
      withWordIndex: 0,
      withoutWordIndex: 0,
      syntheticPoints: 0,
    };
    pendingAdaptationRef.current = null;
    localFallbackSignalRef.current = createInitialLocalFallbackSignal();
    lastPointerRef.current = {
      x: null,
      y: null,
      inside: false,
    };
    socketOpenedAtRef.current = 0;

    const tokenContext = getTrackingAuthTokenContext();
    const token = tokenContext.token;
    const wsUrl = token
      ? buildSocketUrlForVariant({
        token,
      })
      : resolveTrackingSocketUrl({
        trackingBaseUrl,
        apiBaseUrl,
        token,
      });

    if (!token) {
      markDebug({
        authTokenReady: false,
        tokenSourceKey: "",
        tokenClaimsReady: false,
        wsStatus: "blocked:no-token",
        wsUrl,
        sessionId: "",
        trackingContentId: contentId ?? null,
        handshakeVariant: resolveHandshakeVariantLabel(handshakeVariantRef.current),
        sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
      });
      localFallbackAllowedRef.current = false;
      return undefined;
    }

    if (!tokenContext.hasRequiredClaims) {
      markDebug({
        authTokenReady: false,
        tokenSourceKey: tokenContext.sourceKey || "",
        tokenClaimsReady: false,
        wsStatus: "blocked:invalid-token-claims",
        wsUrl,
        sessionId: "",
        trackingContentId: contentId ?? null,
        handshakeVariant: resolveHandshakeVariantLabel(handshakeVariantRef.current),
        sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
        lastError: `invalid_tracking_token_claims:${tokenContext.sourceKey || "unknown_source"}`,
      });
      localFallbackAllowedRef.current = true;
      return undefined;
    }

    localFallbackAllowedRef.current = false;

    const nextSessionId = createTrackingSessionId();
    sessionIdRef.current = nextSessionId;

    markDebug({
      authTokenReady: true,
      tokenSourceKey: tokenContext.sourceKey || "",
      tokenClaimsReady: true,
      wsStatus: "connecting",
      wsUrl,
      wsCloseCode: null,
      wsCloseReason: "",
      sessionId: nextSessionId,
      trackingContentId: contentId ?? null,
      handshakeVariant: resolveHandshakeVariantLabel(handshakeVariantRef.current),
      lastError: "",
      reconnectAttempts: 0,
      sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
      bufferedPoints: pointBufferRef.current.length,
    });

    let isActive = true;

    const connectSocket = () => {
      if (!isActive || closeIntentRef.current) return;

      const tokenContextOnConnect = getTrackingAuthTokenContext();
      const authToken = tokenContextOnConnect.token;
      const activeHandshakeVariant = handshakeVariantRef.current;
      const currentWsUrl = authToken
        ? buildSocketUrlForVariant({
          token: authToken,
        })
        : resolveTrackingSocketUrl({
          trackingBaseUrl,
          apiBaseUrl,
          token: authToken,
        });

      if (!authToken) {
        markDebug({
          authTokenReady: false,
          tokenSourceKey: "",
          tokenClaimsReady: false,
          wsStatus: "blocked:no-token",
          wsUrl: currentWsUrl,
          trackingContentId: contentId ?? null,
          handshakeVariant: resolveHandshakeVariantLabel(activeHandshakeVariant),
          sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
          lastError: "missing_tracking_token",
        });
        localFallbackAllowedRef.current = false;
        return;
      }

      if (!tokenContextOnConnect.hasRequiredClaims) {
        markDebug({
          authTokenReady: false,
          tokenSourceKey: tokenContextOnConnect.sourceKey || "",
          tokenClaimsReady: false,
          wsStatus: "blocked:invalid-token-claims",
          wsUrl: currentWsUrl,
          trackingContentId: contentId ?? null,
          handshakeVariant: resolveHandshakeVariantLabel(activeHandshakeVariant),
          sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
          lastError: `invalid_tracking_token_claims:${tokenContextOnConnect.sourceKey || "unknown_source"}`,
        });
        localFallbackAllowedRef.current = true;
        return;
      }

      localFallbackAllowedRef.current = false;

      markDebug({
        authTokenReady: true,
        tokenSourceKey: tokenContextOnConnect.sourceKey || "",
        tokenClaimsReady: true,
        wsStatus: "connecting",
        wsUrl: currentWsUrl,
        handshakeVariant: resolveHandshakeVariantLabel(activeHandshakeVariant),
        sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
        lastError: "",
      });

      const socket = new WebSocket(currentWsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        socketOpenedAtRef.current = Date.now();
        const sessionStartStrategy = sessionStartStrategyRef.current;

        markDebug({
          wsStatus: "open",
          reconnectAttempts: reconnectAttemptRef.current,
          wsCloseCode: null,
          wsCloseReason: "",
          lastSocketUptimeMs: 0,
          handshakeVariant: resolveHandshakeVariantLabel(activeHandshakeVariant),
          sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategy),
        });

        localFallbackAllowedRef.current = false;

        const authBootstrapEvents = createAuthBootstrapEvents();
        authBootstrapEvents.forEach((message) => {
          sendTrackedEvent(message);
        });

        sendTrackedEvent(createSessionStartEvent({ contentId }));

        // Try to flush immediately on open so short-lived sockets can still emit batches.
        flushPoints();

        clearFlushTimer();
        flushTimerRef.current = window.setInterval(flushPoints, flushIntervalMs);
      };

      socket.onmessage = (event) => {
        handleSocketMessage(event.data);
      };

      socket.onerror = () => {
        markDebug({
          wsStatus: "error",
          lastError: "websocket_error",
        });
      };

      socket.onclose = (event) => {
        clearFlushTimer();
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        const uptimeMs =
          socketOpenedAtRef.current > 0 ? Math.max(0, Date.now() - socketOpenedAtRef.current) : 0;
        socketOpenedAtRef.current = 0;

        markDebug({
          wsStatus: "closed",
          wsCloseCode: event?.code ?? null,
          wsCloseReason: String(event?.reason ?? ""),
          lastSocketUptimeMs: uptimeMs,
          handshakeVariant: resolveHandshakeVariantLabel(handshakeVariantRef.current),
          sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
        });

        if (!isActive || closeIntentRef.current) return;

        if (uptimeMs >= MIN_STABLE_SOCKET_UPTIME_MS) {
          reconnectAttemptRef.current = 0;
        }

        if (uptimeMs <= QUICK_CLOSE_THRESHOLD_MS) {
          sessionStartStrategyRef.current = 0;
          handshakeVariantRef.current = 0;
        }

        const nextAttempt = reconnectAttemptRef.current + 1;
        if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
          localFallbackAllowedRef.current = true;
          markDebug({
            wsStatus: "closed:retry-exhausted",
            reconnectAttempts: reconnectAttemptRef.current,
            lastError: `ws_retry_exhausted_${event?.code ?? "unknown"}`,
            lastSocketUptimeMs: uptimeMs,
            handshakeVariant: resolveHandshakeVariantLabel(handshakeVariantRef.current),
            sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
          });
          return;
        }

        reconnectAttemptRef.current = nextAttempt;

        const reconnectDelayMs = Math.min(1000 * 2 ** (nextAttempt - 1), 10000);
        markDebug({
          wsStatus: "reconnecting",
          reconnectAttempts: nextAttempt,
          lastError: `ws_closed_${event?.code ?? "unknown"}`,
          lastSocketUptimeMs: uptimeMs,
          handshakeVariant: resolveHandshakeVariantLabel(handshakeVariantRef.current),
          sessionStartStrategy: resolveSessionStartStrategyLabel(sessionStartStrategyRef.current),
        });

        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connectSocket();
        }, reconnectDelayMs);
      };
    };

    connectSocket();

    return () => {
      isActive = false;
      endSession();
    };
  }, [
    apiBaseUrl,
    contentId,
    enabled,
    endSession,
    flushIntervalMs,
    flushPoints,
    handleSocketMessage,
    sendTrackedEvent,
    trackingBaseUrl,
    buildSocketUrlForVariant,
    createAuthBootstrapEvents,
    clearReconnectTimer,
    clearFlushTimer,
    markDebug,
  ]);

  useEffect(() => {
    if (!enabled) {
      clearDwellTimer();
      return undefined;
    }

    clearDwellTimer();
    dwellTimerRef.current = window.setInterval(() => {
      const pointer = lastPointerRef.current;
      if (!pointer.inside) return;
      if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return;

      const timestamp = Date.now();
      const activeWordIndex = currentWordIndexRef.current;
      evaluateDwellFallbackByPointer({
        wordIndex: activeWordIndex,
        x: pointer.x,
        y: pointer.y,
        timestamp,
        shouldTrigger: true,
      });

      flushPendingAdaptationIfReady({ timestamp });

      if (Number.isInteger(activeWordIndex) && activeWordIndex >= 0) {
        appendTrackingPoint({
          x: pointer.x,
          y: pointer.y,
          timestamp,
          wordIndex: activeWordIndex,
          isSynthetic: true,
        });
      }

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN && pointBufferRef.current.length >= 4) {
        flushPoints();
      }
    }, DWELL_SAMPLE_INTERVAL_MS);

    return () => {
      clearDwellTimer();
    };
  }, [
    appendTrackingPoint,
    clearDwellTimer,
    enabled,
    evaluateDwellFallbackByPointer,
    flushPoints,
    flushPendingAdaptationIfReady,
  ]);

  const handleStoryPointerMove = useCallback((event) => {
    if (!enabled) return;
    if (event?.pointerType && event.pointerType !== "mouse") return;

    hasPointerOnCurrentPageRef.current = true;

    let resolvedWordIndex = currentWordIndexRef.current;
    const wordElement = event.target?.closest?.("[data-word-index]");
    const wordLayout = getWordLayoutSnapshot(wordElement);
    if (wordElement) {
      const parsed = toIntegerOrNull(wordElement.getAttribute("data-word-index"));
      if (parsed !== null && parsed >= 0) {
        currentWordIndexRef.current = parsed;
        resolvedWordIndex = parsed;
        observedWordIndexesOnPageRef.current.add(parsed);
      }
    }

    const previousPointer = lastPointerRef.current;
    lastPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      inside: true,
    };

    const timestamp = Date.now();

    const didTriggerErraticDistraction = evaluateErraticDistractionFallbackByPointer({
      wordIndex: resolvedWordIndex,
      x: event.clientX,
      y: event.clientY,
      timestamp,
    });

    if (!didTriggerErraticDistraction) {
      evaluateRegressionFallbackByWordIndex({
        wordIndex: resolvedWordIndex,
        timestamp,
        wordElement,
        wordLayout,
        pointerX: event.clientX,
        pointerY: event.clientY,
        previousPointer,
      });
    }

    evaluateDwellFallbackByPointer({
      wordIndex: resolvedWordIndex,
      x: event.clientX,
      y: event.clientY,
      timestamp,
      shouldTrigger: false,
    });

    flushPendingAdaptationIfReady({ timestamp });

    appendTrackingPoint({
      x: event.clientX,
      y: event.clientY,
      timestamp,
      wordIndex: resolvedWordIndex,
      isSynthetic: false,
    });

    const bufferedPoints = pointBufferRef.current.length;

    const socket = socketRef.current;
    const now = timestamp;
    const canEarlyFlush =
      socket?.readyState === WebSocket.OPEN &&
      bufferedPoints >= EARLY_FLUSH_MIN_POINTS &&
      now - lastEarlyFlushAtRef.current >= EARLY_FLUSH_COOLDOWN_MS;

    if (canEarlyFlush) {
      lastEarlyFlushAtRef.current = now;
      flushPoints();
    }
  }, [
    appendTrackingPoint,
    enabled,
    evaluateDwellFallbackByPointer,
    evaluateErraticDistractionFallbackByPointer,
    evaluateRegressionFallbackByWordIndex,
    flushPoints,
    flushPendingAdaptationIfReady,
  ]);

  const handleStoryPointerLeave = useCallback(() => {
    lastPointerRef.current = {
      ...lastPointerRef.current,
      inside: false,
    };

    pendingAdaptationRef.current = null;
    resetLocalFallbackSignal();
  }, [resetLocalFallbackSignal]);

  const handleTooltipRendered = useCallback(() => {}, []);
  const isRenderingStalePageState = pageKeyRef.current !== String(pageKey ?? "");

  return {
    visualFlags: isRenderingStalePageState ? INITIAL_VISUAL_FLAGS : visualFlags,
    wordIntervention: isRenderingStalePageState ? INITIAL_WORD_INTERVENTION : wordIntervention,
    activeTooltip: null,
    trackingDebug,
    handleStoryPointerMove,
    handleStoryPointerLeave,
    handleTooltipRendered,
    dismissTooltip: () => {},
    endSession,
  };
};

export default useReadingDualInterventionSession;
