import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_FLUENT_TIMEOUT_MS,
  DEFAULT_FLUSH_INTERVAL_MS,
  DISTRACTION_HINT_DURATION_MS,
  createTrackingPoint,
  createTrackingSessionId,
  createMouseBatchEvent,
  createSessionEndEvent,
  createSessionStartEvent,
  createTooltipShownEvent,
  getTrackingAuthTokenContext,
  parseTrackingSocketMessage,
  resolveTrackingSocketUrl,
} from "../trackingProtocol";
import {
  createTooltipFromSocketPayload,
  interpretTrackingSocketEvent,
} from "../socketEventInterpreter";
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
const LOCAL_FALLBACK_COOLDOWN_MS = 1800;
const LOCAL_FALLBACK_SIGNAL_RESET_MS = 1600;
const LOCAL_FALLBACK_REGRESSION_MIN_DELTA = 2;
const LOCAL_FALLBACK_REGRESSION_TRIGGER_SCORE = 2;
const LOCAL_FALLBACK_DWELL_TRIGGER_SAMPLES = 6;

const HANDSHAKE_VARIANTS = [
  "tracking:token-only",
];

const scheduleMicrotask =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback) => Promise.resolve().then(callback);

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

const useReadingDualInterventionSession = ({
  enabled,
  contentId,
  apiBaseUrl,
  trackingBaseUrl,
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  fluentTimeoutMs = DEFAULT_FLUENT_TIMEOUT_MS,
  resolveTooltipByWordIndex,
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
  const pointStatsRef = useRef({
    withWordIndex: 0,
    withoutWordIndex: 0,
    syntheticPoints: 0,
  });
  const localFallbackAllowedRef = useRef(false);
  const localFallbackSignalRef = useRef({
    lastWordIndex: null,
    regressionScore: 0,
    dwellWordIndex: null,
    dwellSamples: 0,
    lastObservedAt: 0,
    lastTriggeredAt: 0,
  });
  const lastPointerRef = useRef({
    x: null,
    y: null,
    inside: false,
  });
  const fluentTimerRef = useRef(null);
  const distractionTimerRef = useRef(null);
  const lastAckedTooltipIdRef = useRef("");
  const currentWordIndexRef = useRef(null);
  const resolveTooltipByWordIndexRef = useRef(resolveTooltipByWordIndex);
  const sessionIdRef = useRef("");

  const [visualFlags, setVisualFlags] = useState(INITIAL_VISUAL_FLAGS);
  const [wordIntervention, setWordIntervention] = useState(INITIAL_WORD_INTERVENTION);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [trackingDebug, setTrackingDebug] = useState(INITIAL_TRACKING_DEBUG);

  const markDebug = useCallback((patch) => {
    scheduleMicrotask(() => {
      setTrackingDebug((previous) => ({
        ...previous,
        ...patch,
        lastUpdateAt: Date.now(),
      }));
    });
  }, []);

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

  useEffect(() => {
    resolveTooltipByWordIndexRef.current = resolveTooltipByWordIndex;
  }, [resolveTooltipByWordIndex]);

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
    setVisualFlags(INITIAL_VISUAL_FLAGS);
    setWordIntervention(INITIAL_WORD_INTERVENTION);
    setActiveTooltip(null);
    markDebug({
      localFallbackActive: false,
      localFallbackReason: "",
      localFallbackWordIndex: null,
    });
  }, [markDebug]);

  const resetLocalFallbackSignal = useCallback(() => {
    localFallbackSignalRef.current = {
      lastWordIndex: null,
      regressionScore: 0,
      dwellWordIndex: null,
      dwellSamples: 0,
      lastObservedAt: 0,
      lastTriggeredAt: localFallbackSignalRef.current.lastTriggeredAt,
    };
  }, []);

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
    ({ wordIndex, reason }) => {
      if (!localFallbackAllowedRef.current) return;

      const now = Date.now();
      if (now - localFallbackSignalRef.current.lastTriggeredAt < LOCAL_FALLBACK_COOLDOWN_MS) {
        return;
      }

      localFallbackSignalRef.current.lastTriggeredAt = now;

      setVisualFlags(
        createVisualFlagsFromAdaptation({
          state: ADAPTATION_STATES.REGRESSION,
          mode: "DUAL_INTERVENTION",
          confidence: 0.88,
          params: {
            letterSpacing: 0.094,
            transitionMs: 130,
            colorBandingStrength: 0.24,
            invertedDeep: true,
            invertedStrength: 0.9,
            contrastBoost: 1.22,
          },
        }),
      );

      const resolvedWordIndex = Number.isInteger(wordIndex) && wordIndex >= 0 ? wordIndex : null;
      setWordIntervention((previous) => ({
        ...previous,
        distractionWordIndex: null,
        regressionWordIndex: resolvedWordIndex,
        semanticWordIndex: resolvedWordIndex,
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
    [armFluentTimer],
  );

  const evaluateRegressionFallbackByWordIndex = useCallback(
    ({ wordIndex, timestamp }) => {
      if (!localFallbackAllowedRef.current) return;
      if (!Number.isInteger(wordIndex) || wordIndex < 0) return;

      const signal = localFallbackSignalRef.current;

      if (timestamp - signal.lastObservedAt > LOCAL_FALLBACK_SIGNAL_RESET_MS) {
        signal.regressionScore = 0;
      }

      if (Number.isInteger(signal.lastWordIndex)) {
        const backtrackDelta = signal.lastWordIndex - wordIndex;

        if (backtrackDelta >= LOCAL_FALLBACK_REGRESSION_MIN_DELTA) {
          signal.regressionScore += 1;
        } else if (wordIndex > signal.lastWordIndex) {
          signal.regressionScore = Math.max(0, signal.regressionScore - 0.35);
        } else {
          signal.regressionScore = Math.max(0, signal.regressionScore - 0.15);
        }
      }

      signal.lastWordIndex = wordIndex;
      signal.lastObservedAt = timestamp;

      if (signal.regressionScore >= LOCAL_FALLBACK_REGRESSION_TRIGGER_SCORE) {
        signal.regressionScore = 0;
        triggerLocalFallbackIntervention({
          wordIndex,
          reason: "local-regression-backtrack",
        });
      }
    },
    [triggerLocalFallbackIntervention],
  );

  const applyAdaptationPayload = useCallback(
    (payload) => {
      if (!payload) return;

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
          lastUpdateAt: Date.now(),
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

      setWordIntervention((previous) => ({
        ...previous,
        regressionWordIndex:
          payload.state === ADAPTATION_STATES.REGRESSION ? payload.wordIndex : null,
        distractionWordIndex:
          payload.state === ADAPTATION_STATES.DISTRACTION ? payload.wordIndex : null,
        semanticWordIndex: payload.state === ADAPTATION_STATES.REGRESSION ? payload.wordIndex : null,
      }));

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
    [armFluentTimer, clearDistractionTimer, clearFluentTimer, resetFluentUi],
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
        applyAdaptationPayload(interpreted.payload);
        return;
      }

      if (interpreted.type === "tooltip") {
        countInbound("tooltip", rawEventName);
        const tooltip = createTooltipFromSocketPayload({
          payload: interpreted.payload,
          currentWordIndex: currentWordIndexRef.current,
          resolveTooltipByWordIndex: resolveTooltipByWordIndexRef.current,
        });

        setActiveTooltip(tooltip);

        if (Number.isInteger(tooltip.wordIndex)) {
          setWordIntervention((previous) => ({
            ...previous,
            semanticWordIndex: tooltip.wordIndex,
          }));
        } else {
          setWordIntervention((previous) => ({
            ...previous,
            semanticWordIndex: null,
          }));
        }

        armFluentTimer();
      }
    },
    [
      applyAdaptationPayload,
      armFluentTimer,
      countInbound,
      clearDistractionTimer,
      clearFluentTimer,
      resetFluentUi,
    ],
  );

  const endSession = useCallback(() => {
    closeIntentRef.current = true;
    clearReconnectTimer();
    clearDwellTimer();

    flushPoints();
    sendTrackedEvent(createSessionEndEvent());
    lastAckedTooltipIdRef.current = "";

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
    localFallbackAllowedRef.current = false;
    localFallbackSignalRef.current = {
      lastWordIndex: null,
      regressionScore: 0,
      dwellWordIndex: null,
      dwellSamples: 0,
      lastObservedAt: 0,
      lastTriggeredAt: 0,
    };

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
    localFallbackSignalRef.current = {
      lastWordIndex: null,
      regressionScore: 0,
      dwellWordIndex: null,
      dwellSamples: 0,
      lastObservedAt: 0,
      lastTriggeredAt: 0,
    };
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
    lastAckedTooltipIdRef.current = "";

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

      appendTrackingPoint({
        x: pointer.x,
        y: pointer.y,
        timestamp: Date.now(),
        wordIndex: currentWordIndexRef.current,
        isSynthetic: true,
      });

      const activeWordIndex = currentWordIndexRef.current;
      if (localFallbackAllowedRef.current && Number.isInteger(activeWordIndex) && activeWordIndex >= 0) {
        const signal = localFallbackSignalRef.current;

        if (signal.dwellWordIndex === activeWordIndex) {
          signal.dwellSamples += 1;
        } else {
          signal.dwellWordIndex = activeWordIndex;
          signal.dwellSamples = 1;
        }

        if (signal.dwellSamples >= LOCAL_FALLBACK_DWELL_TRIGGER_SAMPLES) {
          signal.dwellSamples = 0;
          triggerLocalFallbackIntervention({
            wordIndex: activeWordIndex,
            reason: "local-dwell-stall",
          });
        }
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
    flushPoints,
    triggerLocalFallbackIntervention,
  ]);

  const handleStoryPointerMove = useCallback((event) => {
    if (!enabled) return;
    if (event?.pointerType && event.pointerType !== "mouse") return;

    let resolvedWordIndex = currentWordIndexRef.current;
    const wordElement = event.target?.closest?.("[data-word-index]");
    if (wordElement) {
      const parsed = toIntegerOrNull(wordElement.getAttribute("data-word-index"));
      if (parsed !== null && parsed >= 0) {
        currentWordIndexRef.current = parsed;
        resolvedWordIndex = parsed;
      }
    }

    lastPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      inside: true,
    };

    const timestamp = Date.now();

    evaluateRegressionFallbackByWordIndex({
      wordIndex: resolvedWordIndex,
      timestamp,
    });

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
  }, [appendTrackingPoint, enabled, evaluateRegressionFallbackByWordIndex, flushPoints]);

  const handleStoryPointerLeave = useCallback(() => {
    lastPointerRef.current = {
      ...lastPointerRef.current,
      inside: false,
    };

    resetLocalFallbackSignal();
  }, [resetLocalFallbackSignal]);

  const handleTooltipRendered = useCallback(
    (tooltip) => {
      if (!tooltip?.visible) return;
      if (lastAckedTooltipIdRef.current === tooltip.id) return;

      sendTrackedEvent(
        createTooltipShownEvent({
          tooltip,
          cognitiveState: tooltip?.cognitiveState,
        }),
      );

      lastAckedTooltipIdRef.current = tooltip.id;
    },
    [sendTrackedEvent],
  );

  return {
    visualFlags,
    wordIntervention,
    activeTooltip,
    trackingDebug,
    handleStoryPointerMove,
    handleStoryPointerLeave,
    handleTooltipRendered,
    dismissTooltip: () => setActiveTooltip(null),
    endSession,
  };
};

export default useReadingDualInterventionSession;
