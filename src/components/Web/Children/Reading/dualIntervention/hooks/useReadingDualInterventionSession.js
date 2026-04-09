import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_FLUENT_TIMEOUT_MS,
  DEFAULT_FLUSH_INTERVAL_MS,
  DISTRACTION_HINT_DURATION_MS,
  createTrackingPoint,
  createMouseBatchEvent,
  createSessionEndEvent,
  createSessionStartEvent,
  createTooltipShownEvent,
  getTrackingAuthToken,
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

const toIntegerOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) ? parsed : Math.round(parsed);
};

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
  const fluentTimerRef = useRef(null);
  const distractionTimerRef = useRef(null);
  const lastAckedTooltipIdRef = useRef("");
  const currentWordIndexRef = useRef(null);
  const resolveTooltipByWordIndexRef = useRef(resolveTooltipByWordIndex);

  const [visualFlags, setVisualFlags] = useState(INITIAL_VISUAL_FLAGS);
  const [wordIntervention, setWordIntervention] = useState(INITIAL_WORD_INTERVENTION);
  const [activeTooltip, setActiveTooltip] = useState(null);

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

  const resetFluentUi = useCallback(() => {
    setVisualFlags(INITIAL_VISUAL_FLAGS);
    setWordIntervention(INITIAL_WORD_INTERVENTION);
    setActiveTooltip(null);
  }, []);

  const armFluentTimer = useCallback(() => {
    clearFluentTimer();

    fluentTimerRef.current = window.setTimeout(() => {
      resetFluentUi();
    }, fluentTimeoutMs);
  }, [clearFluentTimer, fluentTimeoutMs, resetFluentUi]);

  const flushPoints = useCallback(() => {
    if (pointBufferRef.current.length === 0) return;

    const points = pointBufferRef.current.splice(0, pointBufferRef.current.length);
    sendEvent(createMouseBatchEvent(points));
  }, [sendEvent]);

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

      armFluentTimer();
    },
    [armFluentTimer, clearDistractionTimer, clearFluentTimer, resetFluentUi],
  );

  const handleSocketMessage = useCallback(
    (rawData) => {
      const message = parseTrackingSocketMessage(rawData);
      const interpreted = interpretTrackingSocketEvent({
        message,
        currentWordIndex: currentWordIndexRef.current,
      });

      if (interpreted.type === "ignore") return;

      if (interpreted.type === "reset") {
        resetFluentUi();
        clearFluentTimer();
        clearDistractionTimer();
        return;
      }

      if (interpreted.type === "adaptation") {
        applyAdaptationPayload(interpreted.payload);
        return;
      }

      if (interpreted.type === "tooltip") {
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
      clearDistractionTimer,
      clearFluentTimer,
      resetFluentUi,
    ],
  );

  const endSession = useCallback(() => {
    flushPoints();
    sendEvent(createSessionEndEvent());

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

    resetFluentUi();
  }, [
    clearDistractionTimer,
    clearFlushTimer,
    clearFluentTimer,
    flushPoints,
    resetFluentUi,
    sendEvent,
  ]);

  useEffect(() => {
    if (!enabled) return undefined;

    const token = getTrackingAuthToken();
    const wsUrl = resolveTrackingSocketUrl({
      trackingBaseUrl,
      apiBaseUrl,
      token,
    });

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      sendEvent(createSessionStartEvent({ contentId }));

      clearFlushTimer();
      flushTimerRef.current = window.setInterval(flushPoints, flushIntervalMs);
    };

    socket.onmessage = (event) => {
      handleSocketMessage(event.data);
    };

    socket.onerror = () => {
      // Keep socket status local to callbacks; consumers do not rely on this state yet.
    };

    socket.onclose = () => {
      clearFlushTimer();
    };

    return () => {
      if (socketRef.current === socket) {
        endSession();
      }
    };
  }, [
    apiBaseUrl,
    contentId,
    enabled,
    endSession,
    flushIntervalMs,
    flushPoints,
    handleSocketMessage,
    sendEvent,
    trackingBaseUrl,
    clearFlushTimer,
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

    pointBufferRef.current.push(
      createTrackingPoint({
        x: event.clientX,
        y: event.clientY,
        timestamp: Date.now(),
        wordIndex: resolvedWordIndex,
      }),
    );

    if (pointBufferRef.current.length > 5000) {
      pointBufferRef.current.shift();
    }
  }, [enabled]);

  const handleTooltipRendered = useCallback(
    (tooltip) => {
      if (!tooltip?.visible) return;
      if (lastAckedTooltipIdRef.current === tooltip.id) return;

      sendEvent(
        createTooltipShownEvent({
          tooltip,
          cognitiveState: tooltip?.cognitiveState,
        }),
      );

      lastAckedTooltipIdRef.current = tooltip.id;
    },
    [sendEvent],
  );

  return {
    visualFlags,
    wordIntervention,
    activeTooltip,
    handleStoryPointerMove,
    handleTooltipRendered,
    dismissTooltip: () => setActiveTooltip(null),
    endSession,
  };
};

export default useReadingDualInterventionSession;
