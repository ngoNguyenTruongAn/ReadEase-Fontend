import { useCallback, useEffect, useRef } from "react";

const DEFAULT_LANGUAGE = "vi-VN";
const CANCEL_DELAY_MS = 35;
const ENGINE_RETRY_MS = 16;
const ENGINE_WATCHDOG_MS = 48;

const normalizeHoverSpeechText = (value) =>
  String(value ?? "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();

const pickPreferredVietnameseVoice = (voices) => {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const exactVietnamese = voices.find((voice) =>
    /^vi(-vn)?$/i.test(String(voice.lang || "")),
  );
  const localeVietnamese = voices.find((voice) =>
    String(voice.lang || "").toLowerCase().startsWith("vi"),
  );
  const namedVietnamese = voices.find((voice) =>
    /(vietnam|ti[eế]ng\s*vi[eệ]t|vi[-_ ]?vn)/i.test(String(voice.name || "")),
  );

  return exactVietnamese || localeVietnamese || namedVietnamese || null;
};

const useHoverSpeech = ({ enabled, language = DEFAULT_LANGUAGE }) => {
  const cancelTimerRef = useRef(null);
  const engineRetryTimerRef = useRef(null);
  const watchdogTimerRef = useRef(null);
  const desiredTextRef = useRef("");
  const speakingTextRef = useRef("");
  const isEnabledRef = useRef(false);
  const preferredVoiceRef = useRef(null);

  const clearCancelTimer = useCallback(() => {
    if (!cancelTimerRef.current) return;

    window.clearTimeout(cancelTimerRef.current);
    cancelTimerRef.current = null;
  }, []);

  const clearEngineRetryTimer = useCallback(() => {
    if (!engineRetryTimerRef.current) return;

    window.clearTimeout(engineRetryTimerRef.current);
    engineRetryTimerRef.current = null;
  }, []);

  const clearWatchdogTimer = useCallback(() => {
    if (!watchdogTimerRef.current) return;

    window.clearTimeout(watchdogTimerRef.current);
    watchdogTimerRef.current = null;
  }, []);

  const syncPreferredVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) return;

    preferredVoiceRef.current = pickPreferredVietnameseVoice(
      window.speechSynthesis.getVoices(),
    );
  }, []);

  const syncEngine = useCallback(() => {
    if (!isEnabledRef.current) return;
    if (!("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;
    const desiredText = desiredTextRef.current;

    if (!desiredText) {
      speakingTextRef.current = "";
      clearEngineRetryTimer();
      clearWatchdogTimer();
      if (synth.speaking || synth.pending) {
        synth.cancel();
      }
      return;
    }

    if (speakingTextRef.current === desiredText && synth.speaking) {
      return;
    }

    if (synth.speaking || synth.pending) {
      synth.cancel();
      clearEngineRetryTimer();
      engineRetryTimerRef.current = window.setTimeout(() => {
        syncEngine();
      }, ENGINE_RETRY_MS);
      return;
    }

    const speechText = desiredText;
    const utterance = new SpeechSynthesisUtterance(speechText);
    const preferredVoice = preferredVoiceRef.current;

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang || language;
    } else {
      utterance.lang = language;
    }

    utterance.rate = 1.02;
    speakingTextRef.current = speechText;

    utterance.onend = () => {
      if (speakingTextRef.current !== speechText) return;

      speakingTextRef.current = "";
      if (!isEnabledRef.current) return;
      if (!desiredTextRef.current) return;
      if (desiredTextRef.current !== speechText) {
        syncEngine();
      }
    };

    utterance.onerror = () => {
      if (speakingTextRef.current !== speechText) return;

      speakingTextRef.current = "";
      if (!isEnabledRef.current) return;

      clearEngineRetryTimer();
      engineRetryTimerRef.current = window.setTimeout(() => {
        syncEngine();
      }, ENGINE_RETRY_MS);
    };

    synth.speak(utterance);

    clearWatchdogTimer();
    watchdogTimerRef.current = window.setTimeout(() => {
      if (!isEnabledRef.current) return;
      if (!desiredTextRef.current) return;
      if (synth.speaking || synth.pending) return;

      speakingTextRef.current = "";
      syncEngine();
    }, ENGINE_WATCHDOG_MS);
  }, [clearEngineRetryTimer, clearWatchdogTimer, language]);

  const stop = useCallback(() => {
    desiredTextRef.current = "";
    speakingTextRef.current = "";

    clearCancelTimer();
    clearEngineRetryTimer();
    clearWatchdogTimer();
    window.speechSynthesis?.cancel();
  }, [clearCancelTimer, clearEngineRetryTimer, clearWatchdogTimer]);

  const handleHoverStart = useCallback(
    (rawText) => {
      if (!isEnabledRef.current) return;
      if (!("speechSynthesis" in window)) return;

      const normalized = normalizeHoverSpeechText(rawText);
      if (!normalized) return;
      if (normalized === desiredTextRef.current) return;

      desiredTextRef.current = normalized;
      clearCancelTimer();
      syncEngine();
    },
    [clearCancelTimer, syncEngine],
  );

  const handleHoverEnd = useCallback(() => {
    if (!isEnabledRef.current) return;

    clearCancelTimer();
    cancelTimerRef.current = window.setTimeout(() => {
      desiredTextRef.current = "";
      speakingTextRef.current = "";

      clearEngineRetryTimer();
      clearWatchdogTimer();
      window.speechSynthesis?.cancel();
    }, CANCEL_DELAY_MS);
  }, [clearCancelTimer, clearEngineRetryTimer, clearWatchdogTimer]);

  useEffect(() => {
    isEnabledRef.current = Boolean(enabled);

    if (!enabled) {
      stop();
    }
  }, [enabled, stop]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return undefined;

    syncPreferredVoice();

    const handleVoicesChanged = () => {
      syncPreferredVoice();
    };

    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
    };
  }, [syncPreferredVoice]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    handleHoverStart,
    handleHoverEnd,
    stop,
  };
};

export default useHoverSpeech;
