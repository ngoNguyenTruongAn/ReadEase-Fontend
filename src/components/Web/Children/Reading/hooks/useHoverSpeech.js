import { useCallback, useEffect, useRef } from "react";
import {
  HOVER_TTS_CONFIG,
  HOVER_TTS_DEFAULT_LANGUAGE,
  normalizeGoogleTranslateLanguage,
} from "../tts/config";
import { createHoverTtsAudioEngine } from "../tts/core/createHoverTtsAudioEngine";
import { createGoogleTranslateTtsProvider } from "../tts/providers/googleTranslateTtsProvider";

const VIETNAMESE_NATIVE_VOICE_HINTS = [
  /hoai\s*my/i,
  /microsoft\s+hoaimy/i,
  /google\s+(ti[eế]ng\s*)?vi[eệ]t/i,
  /vietnam/i,
  /ti[eế]ng\s*vi[eệ]t/i,
  /vi[-_ ]?vn/i,
];

const normalizeLang = (value) => String(value || "").trim().toLowerCase();

const isVietnameseNativeVoice = (voice) => {
  const lang = normalizeLang(voice?.lang);
  if (lang === "vi" || lang === "vi-vn" || lang.startsWith("vi-")) return true;

  const name = String(voice?.name || "");
  return VIETNAMESE_NATIVE_VOICE_HINTS.some((pattern) => pattern.test(name));
};

const scoreVietnameseNativeVoice = ({ voice, language, preferredNameHint }) => {
  if (!voice) return Number.NEGATIVE_INFINITY;

  const targetLang = normalizeLang(language);
  const lang = normalizeLang(voice.lang);
  const name = String(voice.name || "");
  const normalizedPreferredHint = String(preferredNameHint || "").trim().toLowerCase();
  let score = 0;

  if (lang === targetLang) score += 280;
  if (lang === "vi-vn") score += 220;
  if (lang === "vi" || lang.startsWith("vi-")) score += 180;
  if (voice.localService) score += 60;
  if (voice.default) score += 20;

  if (VIETNAMESE_NATIVE_VOICE_HINTS.some((pattern) => pattern.test(name))) {
    score += 120;
  }

  if (normalizedPreferredHint && name.toLowerCase().includes(normalizedPreferredHint)) {
    score += 260;
  }

  if (/natural|neural|enhanced|premium/i.test(name)) {
    score += 20;
  }

  return score;
};

const pickPreferredVietnameseNativeVoice = ({ voices, language, preferredNameHint }) => {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const candidates = voices.filter((voice) => isVietnameseNativeVoice(voice));
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    if (!best) return current;

    return scoreVietnameseNativeVoice({
      voice: current,
      language,
      preferredNameHint,
    }) >
      scoreVietnameseNativeVoice({
        voice: best,
        language,
        preferredNameHint,
      })
      ? current
      : best;
  }, null);
};

const useHoverSpeech = ({ enabled, language = HOVER_TTS_DEFAULT_LANGUAGE }) => {
  const engineRef = useRef(null);
  const isEnabledRef = useRef(Boolean(enabled));
  const preferredNativeVoiceRef = useRef(null);
  const hasLoggedAutoplayWarningRef = useRef(false);
  const hasLoggedUnsupportedSourceRef = useRef(false);
  const hasLoggedMissingVietnameseVoiceRef = useRef(false);
  const lastNativeFallbackTextRef = useRef("");
  const lastNativeFallbackAtRef = useRef(0);

  const syncPreferredNativeVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;
    const voices = synth.getVoices?.() || [];
    preferredNativeVoiceRef.current = pickPreferredVietnameseNativeVoice({
      voices,
      language,
      preferredNameHint: HOVER_TTS_CONFIG.native?.preferredVoiceNameHint,
    });

    if (
      normalizeGoogleTranslateLanguage(language) === "vi" &&
      voices.length > 0 &&
      !preferredNativeVoiceRef.current &&
      !hasLoggedMissingVietnameseVoiceRef.current
    ) {
      hasLoggedMissingVietnameseVoiceRef.current = true;
      console.warn(
        "[HoverTTS] No Vietnamese native voice found in this browser. Install a Vietnamese OS/browser voice for local fallback.",
      );
    }

    if (preferredNativeVoiceRef.current) {
      hasLoggedMissingVietnameseVoiceRef.current = false;
    }
  }, [language]);

  const speakWithNativeFallback = useCallback(
    (rawText) => {
      if (!("speechSynthesis" in window)) {
        return false;
      }

      const text = String(rawText ?? "").trim();
      if (!text) return false;
      const now = Date.now();
      if (text === lastNativeFallbackTextRef.current && now - lastNativeFallbackAtRef.current < 700) {
        return true;
      }

      const synth = window.speechSynthesis;
      syncPreferredNativeVoice();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = normalizeGoogleTranslateLanguage(language) === "vi" ? "vi-VN" : language;
      utterance.rate = HOVER_TTS_CONFIG.playbackRate;

      const preferredNativeVoice = preferredNativeVoiceRef.current;
      if (preferredNativeVoice) {
        utterance.voice = preferredNativeVoice;
        utterance.lang = preferredNativeVoice.lang || utterance.lang;
      }

      try {
        synth.cancel();
        synth.speak(utterance);
        lastNativeFallbackTextRef.current = text;
        lastNativeFallbackAtRef.current = now;
        return true;
      } catch {
        return false;
      }
    },
    [language, syncPreferredNativeVoice],
  );

  const handlePlaybackError = useCallback(({ error, providerId, url, attemptedUrls, sourceText }) => {
    const errorName = String(error?.name || "UnknownError");
    const errorMessage = String(error?.message || "");

    if (errorName === "AbortError") {
      return;
    }

    if (errorName === "NotAllowedError") {
      if (!hasLoggedAutoplayWarningRef.current) {
        hasLoggedAutoplayWarningRef.current = true;
        console.warn(
          `[HoverTTS] Browser blocked audio autoplay (${providerId}). Click the Hover to Speech button once, then hover again.`,
        );
      }
      return;
    }

    if (errorName === "NotSupportedError") {
      if (!hasLoggedUnsupportedSourceRef.current) {
        hasLoggedUnsupportedSourceRef.current = true;
        const attempted = Array.isArray(attemptedUrls) ? attemptedUrls.join(" | ") : "n/a";
        console.warn(
          `[HoverTTS] Audio source unsupported (${providerId}). Last URL: ${url || "n/a"}. Attempts: ${attempted}`,
        );
      }

      const didFallbackToNative = speakWithNativeFallback(sourceText);
      if (!didFallbackToNative) {
        console.warn("[HoverTTS] Native fallback is unavailable in this browser context.");
      }
      return;
    }

    console.warn(`[HoverTTS] Playback error (${providerId}): ${errorName} ${errorMessage}`);
  }, [speakWithNativeFallback]);

  const createEngine = useCallback(() => {
    const provider = createGoogleTranslateTtsProvider({
      baseUrl: HOVER_TTS_CONFIG.googleTranslate.baseUrl,
      client: HOVER_TTS_CONFIG.googleTranslate.client,
      language: normalizeGoogleTranslateLanguage(language),
      maxCharsPerRequest: HOVER_TTS_CONFIG.googleTranslate.maxCharsPerRequest,
    });

    return createHoverTtsAudioEngine({
      provider,
      stopDelayMs: HOVER_TTS_CONFIG.stopDelayMs,
      playbackRate: HOVER_TTS_CONFIG.playbackRate,
      onPlaybackError: handlePlaybackError,
    });
  }, [handlePlaybackError, language]);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = createEngine();
    }

    return engineRef.current;
  }, [createEngine]);

  const stop = useCallback(() => {
    engineRef.current?.stop();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    lastNativeFallbackTextRef.current = "";
    lastNativeFallbackAtRef.current = 0;
  }, []);

  const primeFromGesture = useCallback(() => {
    ensureEngine()
      .primeFromUserGesture()
      .then(() => {
        hasLoggedAutoplayWarningRef.current = false;
        hasLoggedUnsupportedSourceRef.current = false;
        lastNativeFallbackTextRef.current = "";
        lastNativeFallbackAtRef.current = 0;
      })
      .catch(() => {
        // no-op
      });
  }, [ensureEngine]);

  const handleHoverStart = useCallback(
    (rawText) => {
      if (!isEnabledRef.current) return;

      ensureEngine().speak(rawText);
    },
    [ensureEngine],
  );

  const handleHoverEnd = useCallback(() => {
    if (!isEnabledRef.current) return;

    engineRef.current?.scheduleStop();
  }, []);

  useEffect(() => {
    isEnabledRef.current = Boolean(enabled);

    if (!enabled) {
      stop();
      return;
    }

    ensureEngine();
  }, [enabled, ensureEngine, stop]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return undefined;

    const synth = window.speechSynthesis;
    syncPreferredNativeVoice();

    const handleVoicesChanged = () => {
      syncPreferredNativeVoice();
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
  }, [syncPreferredNativeVoice]);

  useEffect(() => {
    if (!engineRef.current) return;

    // Recreate engine when language changes so provider URLs keep matching locale.
    engineRef.current.dispose();
    engineRef.current = createEngine();
  }, [createEngine]);

  useEffect(() => {
    return () => {
      if (!engineRef.current) return;

      engineRef.current.dispose();
      engineRef.current = null;
    };
  }, []);

  return {
    handleHoverStart,
    handleHoverEnd,
    primeFromGesture,
    stop,
  };
};

export default useHoverSpeech;
