import { normalizeGoogleTranslateLanguage } from "../config";

const DEFAULT_GOOGLE_TTS_BASE_URLS = [
  "https://translate.googleapis.com/translate_tts",
  "https://translate.google.com/translate_tts",
];

const normalizeHoverSpeechText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();

const chunkTextByWordBoundary = (text, maxCharsPerRequest) => {
  const source = normalizeHoverSpeechText(text);
  if (!source) return [];
  if (source.length <= maxCharsPerRequest) return [source];

  const words = source.split(/\s+/).filter(Boolean);
  const chunks = [];
  let bucket = "";

  words.forEach((word) => {
    const nextBucket = bucket ? `${bucket} ${word}` : word;
    if (nextBucket.length <= maxCharsPerRequest) {
      bucket = nextBucket;
      return;
    }

    if (bucket) {
      chunks.push(bucket);
    }

    if (word.length <= maxCharsPerRequest) {
      bucket = word;
      return;
    }

    for (let index = 0; index < word.length; index += maxCharsPerRequest) {
      chunks.push(word.slice(index, index + maxCharsPerRequest));
    }
    bucket = "";
  });

  if (bucket) {
    chunks.push(bucket);
  }

  return chunks;
};

const buildGoogleTranslateTtsUrl = ({ baseUrl, client, language, text }) => {
  const url = new URL(baseUrl);
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", client);
  url.searchParams.set("tl", normalizeGoogleTranslateLanguage(language));
  url.searchParams.set("q", text);
  return url.toString();
};

const buildBaseUrlCandidates = (baseUrl) => {
  const mergedCandidates = [String(baseUrl || "").trim(), ...DEFAULT_GOOGLE_TTS_BASE_URLS].filter(
    Boolean,
  );
  const uniqueCandidates = [];

  mergedCandidates.forEach((candidate) => {
    try {
      const normalized = new URL(candidate).toString();
      if (!uniqueCandidates.includes(normalized)) {
        uniqueCandidates.push(normalized);
      }
    } catch {
      // Ignore invalid custom URL and continue with defaults.
    }
  });

  return uniqueCandidates;
};

export const createGoogleTranslateTtsProvider = ({
  baseUrl,
  client,
  language,
  maxCharsPerRequest,
}) => {
  const baseUrlCandidates = buildBaseUrlCandidates(baseUrl);

  const buildAudioUrls = (segment) =>
    baseUrlCandidates.map((candidateBaseUrl) =>
      buildGoogleTranslateTtsUrl({
        baseUrl: candidateBaseUrl,
        client,
        language,
        text: segment,
      }),
    );

  return {
    id: "google-translate",
    normalizeText: normalizeHoverSpeechText,
    createSegments: (text) => chunkTextByWordBoundary(text, maxCharsPerRequest),
    buildAudioUrls,
    buildAudioUrl: (segment) => buildAudioUrls(segment)[0],
  };
};
