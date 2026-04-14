const NON_NEWLINE_WHITESPACE_PATTERN = /^[ \t\f\v]+$/;
const ALPHANUMERIC_PATTERN = /[\p{L}\p{N}]/u;

const toStringSafe = (value) => String(value ?? "");

const normalizeParagraphBreaks = (value) => toStringSafe(value).replace(/\r\n?/g, "\n");

const normalizeWordCandidate = (value) =>
  toStringSafe(value)
    .replace(/_/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export const resolveSegmentedTextInput = ({ segmentedText, bodySegmented, fallbackText, body }) => {
  const segmentedCandidate =
    toStringSafe(segmentedText).trim() || toStringSafe(bodySegmented).trim();
  if (segmentedCandidate) {
    return normalizeParagraphBreaks(segmentedCandidate);
  }

  const fallbackCandidate = toStringSafe(fallbackText).trim() || toStringSafe(body).trim();
  return normalizeParagraphBreaks(fallbackCandidate);
};

export const parseHybridVietnameseTokens = (inputText) => {
  const source = normalizeParagraphBreaks(inputText);
  if (!source) return [];

  const parts = source.split(/(\n|[ \t\f\v]+)/g).filter((part) => part !== "");

  const tokens = [];
  let wordIndex = 0;
  let paragraphIndex = 0;

  for (let tokenIndex = 0; tokenIndex < parts.length; tokenIndex += 1) {
    const value = parts[tokenIndex];

    if (value === "\n") {
      tokens.push({
        id: `seg-${tokenIndex}`,
        type: "newline",
        value,
        paragraphIndex,
      });
      paragraphIndex += 1;
      continue;
    }

    if (NON_NEWLINE_WHITESPACE_PATTERN.test(value)) {
      tokens.push({
        id: `seg-${tokenIndex}`,
        type: "space",
        value,
        paragraphIndex,
      });
      continue;
    }

    const rawToken = value;
    const displayText = rawToken.replace(/_/g, " ");
    const normalized = normalizeWordCandidate(rawToken);
    const isWord = ALPHANUMERIC_PATTERN.test(normalized);

    tokens.push({
      id: `seg-${tokenIndex}`,
      type: isWord ? "word" : "punctuation",
      value: displayText,
      rawToken,
      displayText,
      normalized,
      paragraphIndex,
      wordIndex: isWord ? wordIndex : null,
    });

    if (isWord) {
      wordIndex += 1;
    }
  }

  return tokens;
};

export const extractHybridVietnameseWordEntries = (inputText) =>
  parseHybridVietnameseTokens(inputText)
    .filter((token) => token.type === "word" && Number.isInteger(token.wordIndex))
    .map((token) => ({
      index: token.wordIndex,
      value: token.displayText,
      rawToken: token.rawToken,
      normalized: token.normalized,
      paragraphIndex: token.paragraphIndex,
    }));

export const countHybridVietnameseWords = (inputText) =>
  extractHybridVietnameseWordEntries(inputText).length;

export const buildHybridHoverSpeechText = (value) =>
  toStringSafe(value)
    .replace(/_/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
