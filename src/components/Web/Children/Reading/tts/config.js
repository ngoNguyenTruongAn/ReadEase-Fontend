const toStringSafe = (value) => String(value ?? "").trim();

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

export const HOVER_TTS_DEFAULT_LANGUAGE = "vi-VN";

export const HOVER_TTS_CONFIG = {
  stopDelayMs: toPositiveInteger(import.meta.env?.VITE_HOVER_TTS_STOP_DELAY_MS, 95),
  playbackRate: toPositiveNumber(import.meta.env?.VITE_HOVER_TTS_PLAYBACK_RATE, 0.95),
  native: {
    preferredVoiceNameHint: toStringSafe(import.meta.env?.VITE_HOVER_NATIVE_VOICE_NAME_HINT),
  },
  googleTranslate: {
    baseUrl:
      toStringSafe(import.meta.env?.VITE_GOOGLE_TRANSLATE_TTS_BASE_URL) ||
      "https://translate.googleapis.com/translate_tts",
    client: toStringSafe(import.meta.env?.VITE_GOOGLE_TRANSLATE_TTS_CLIENT) || "tw-ob",
    maxCharsPerRequest: toPositiveInteger(
      import.meta.env?.VITE_GOOGLE_TRANSLATE_TTS_MAX_CHARS,
      180,
    ),
  },
};

export const normalizeGoogleTranslateLanguage = (language) => {
  const normalized = toStringSafe(language).toLowerCase();
  if (!normalized) return "vi";

  if (normalized === "vi" || normalized.startsWith("vi-")) {
    return "vi";
  }

  return normalized.split("-")[0] || "vi";
};
