import { useCallback, useEffect, useRef } from "react";

const DEFAULT_LANGUAGE = "vi-VN";

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
};

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const HOVER_STOP_DELAY_MS = toPositiveInteger(import.meta.env?.VITE_HOVER_TTS_STOP_DELAY_MS, 95);
const HOVER_PLAYBACK_RATE = toPositiveNumber(import.meta.env?.VITE_HOVER_TTS_PLAYBACK_RATE, 0.95);
const PREFERRED_VOICE_NAME_HINT = String(
  import.meta.env?.VITE_HOVER_NATIVE_VOICE_NAME_HINT || "Microsoft An",
)
  .trim()
  .toLowerCase();

const VIETNAMESE_VOICE_NAME_HINTS = [
  /microsoft\s+an/i,
  /microsoft\s+hoaimy/i,
  /hoai\s*my/i,
  /vietnam/i,
  /ti[eế]ng\s*vi[eệ]t/i,
  /vi[-_ ]?vn/i,
];

const normalizeLang = (value) => String(value || "").trim().toLowerCase();

const normalizeHoverSpeechText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();

const isVietnameseVoice = (voice) => {
  const lang = normalizeLang(voice?.lang);
  if (lang === "vi" || lang === "vi-vn" || lang.startsWith("vi-")) return true;

  const name = String(voice?.name || "");
  return VIETNAMESE_VOICE_NAME_HINTS.some((pattern) => pattern.test(name));
};

const scoreVietnameseVoice = ({ voice, language }) => {
  if (!voice) return Number.NEGATIVE_INFINITY;

  const targetLang = normalizeLang(language);
  const lang = normalizeLang(voice.lang);
  const name = String(voice.name || "");
  const normalizedName = name.toLowerCase();
  let score = 0;

  if (lang === targetLang) score += 280;
  if (lang === "vi-vn") score += 220;
  if (lang === "vi" || lang.startsWith("vi-")) score += 180;
  if (voice.localService) score += 60;
  if (voice.default) score += 20;

  if (VIETNAMESE_VOICE_NAME_HINTS.some((pattern) => pattern.test(name))) {
    score += 120;
  }

  if (PREFERRED_VOICE_NAME_HINT && normalizedName.includes(PREFERRED_VOICE_NAME_HINT)) {
    score += 260;
  }

  if (/natural|neural|enhanced|premium/i.test(name)) {
    score += 20;
  }

  return score;
};

const pickPreferredVietnameseVoice = ({ voices, language }) => {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const candidates = voices.filter((voice) => isVietnameseVoice(voice));
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    if (!best) return current;

    return scoreVietnameseVoice({
      voice: current,
      language,
    }) >
      scoreVietnameseVoice({
        voice: best,
        language,
      })
      ? current
      : best;
  }, null);
};

const useHoverSpeech = ({ enabled, language = DEFAULT_LANGUAGE }) => {
  const isEnabledRef = useRef(Boolean(enabled));
  const preferredVoiceRef = useRef(null);
  const stopTimerRef = useRef(null);
  const activeTextRef = useRef("");
  const hasLoggedNoVietnameseVoiceRef = useRef(false);

  const clearStopTimer = useCallback(() => {
    if (!stopTimerRef.current) return;

    window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  }, []);

  const syncPreferredVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;
    const voices = synth.getVoices?.() || [];

    preferredVoiceRef.current = pickPreferredVietnameseVoice({
      voices,
      language,
    });

    if (
      normalizeLang(language).startsWith("vi") &&
      voices.length > 0 &&
      !preferredVoiceRef.current &&
      !hasLoggedNoVietnameseVoiceRef.current
    ) {
      hasLoggedNoVietnameseVoiceRef.current = true;
      console.warn(
        "[HoverSpeech] No Vietnamese voice found. Install Vietnamese voice pack (e.g. Microsoft An) in Windows settings.",
      );
    }

    if (preferredVoiceRef.current) {
      hasLoggedNoVietnameseVoiceRef.current = false;
    }
  }, [language]);

  const speakText = useCallback(
    (rawText) => {
      if (!("speechSynthesis" in window)) return false;

      const text = normalizeHoverSpeechText(rawText);
      if (!text) return false;

      const synth = window.speechSynthesis;
      if (text === activeTextRef.current && synth.speaking) {
        return true;
      }

      clearStopTimer();
      syncPreferredVoice();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = HOVER_PLAYBACK_RATE;
      utterance.pitch = 1;

      const preferredVoice = preferredVoiceRef.current;
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang || utterance.lang;
      }

      utterance.onend = () => {
        if (activeTextRef.current === text) {
          activeTextRef.current = "";
        }
      };

      utterance.onerror = () => {
        if (activeTextRef.current === text) {
          activeTextRef.current = "";
        }
      };

      activeTextRef.current = text;

      try {
        synth.cancel();
        synth.speak(utterance);
        return true;
      } catch {
        activeTextRef.current = "";
        return false;
      }
    },
    [clearStopTimer, language, syncPreferredVoice],
  );

  const stop = useCallback(() => {
    clearStopTimer();
    activeTextRef.current = "";
    window.speechSynthesis?.cancel();
  }, [clearStopTimer]);

  const primeFromGesture = useCallback(() => {
    clearStopTimer();
    syncPreferredVoice();

    try {
      window.speechSynthesis?.resume?.();
    } catch {
      // no-op
    }
  }, [clearStopTimer, syncPreferredVoice]);

  const handleHoverStart = useCallback(
    (rawText) => {
      if (!isEnabledRef.current) return;

      speakText(rawText);
    },
    [speakText],
  );

  const handleHoverEnd = useCallback(() => {
    if (!isEnabledRef.current) return;

    clearStopTimer();
    stopTimerRef.current = window.setTimeout(() => {
      activeTextRef.current = "";
      window.speechSynthesis?.cancel();
    }, HOVER_STOP_DELAY_MS);
  }, [clearStopTimer]);

  useEffect(() => {
    isEnabledRef.current = Boolean(enabled);

    if (!enabled) {
      stop();
      return;
    }

    syncPreferredVoice();
  }, [enabled, stop, syncPreferredVoice]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return undefined;

    const synth = window.speechSynthesis;
    syncPreferredVoice();

    const handleVoicesChanged = () => {
      syncPreferredVoice();
    };

    const previousVoicesChangedHandler = synth.onvoiceschanged;
    synth.onvoiceschanged = handleVoicesChanged;

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", handleVoicesChanged);
    }

    return () => {
      if (typeof synth.removeEventListener === "function") {
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
      }

      if (synth.onvoiceschanged === handleVoicesChanged) {
        synth.onvoiceschanged = previousVoicesChangedHandler || null;
      }
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
    primeFromGesture,
    stop,
  };
};

export default useHoverSpeech;
