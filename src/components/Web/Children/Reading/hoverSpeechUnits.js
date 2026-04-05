const VI_COMPOUND_HOVER_PHRASES = new Set([
  "sinh viên",
  "học sinh",
  "giáo viên",
  "công nghệ",
  "đại học",
  "tiểu học",
  "trung học",
  "con chó",
  "con mèo",
  "con cá",
  "con chim",
  "bầu trời",
  "mặt trời",
  "mặt trăng",
  "thành phố",
  "đất nước",
  "gia đình",
]);

const VI_CLASSIFIER_WORDS = new Set([
  "con",
  "cái",
  "chiếc",
  "cây",
  "quyển",
  "cuốn",
  "tờ",
  "bức",
  "viên",
  "miếng",
  "hòn",
  "bộ",
  "đôi",
]);

const isWhitespaceToken = (token) => /^\s+$/.test(token);

const normalizeToken = (token) =>
  String(token ?? "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();

const isWordLike = (token) => /[\p{L}\p{N}]/u.test(normalizeToken(token));

const buildFallbackHoverUnits = (text) => {
  const tokens = String(text ?? "").split(/(\s+)/);
  const units = [];

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];

    if (!token) {
      index += 1;
      continue;
    }

    if (isWhitespaceToken(token)) {
      units.push({
        type: "space",
        key: `space-${index}`,
        text: token,
      });
      index += 1;
      continue;
    }

    const token1 = token;
    const space1 = tokens[index + 1] ?? "";
    const token2 = tokens[index + 2] ?? "";
    const space2 = tokens[index + 3] ?? "";
    const token3 = tokens[index + 4] ?? "";

    const word1 = normalizeToken(token1);
    const word2 = normalizeToken(token2);
    const word3 = normalizeToken(token3);

    let consumed = 1;
    if (word1 && isWhitespaceToken(space1) && word2) {
      const trigram = `${word1} ${word2} ${word3}`;
      const bigram = `${word1} ${word2}`;

      const isKnownTrigram =
        word3 && isWhitespaceToken(space2) && VI_COMPOUND_HOVER_PHRASES.has(trigram);
      const isKnownBigram = VI_COMPOUND_HOVER_PHRASES.has(bigram);
      const isClassifierPhrase =
        VI_CLASSIFIER_WORDS.has(word1) && isWordLike(token2) && !/[.!?;:]/.test(token2);

      if (isKnownTrigram) {
        consumed = 5;
      } else if (isKnownBigram || isClassifierPhrase) {
        consumed = 3;
      }
    }

    const hoverRawText = tokens.slice(index, index + consumed).join("");
    const hoverText = hoverRawText
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
      .replace(/\s+/g, " ")
      .trim();

    units.push({
      type: "hover",
      key: `unit-${index}`,
      hoverText,
      tokens: tokens.slice(index, index + consumed),
    });

    index += consumed;
  }

  return units;
};

const isValidBackendHoverUnit = (unit, index) => {
  const hasKey = typeof unit?.key === "string" || typeof unit?.id === "string";
  const hasHoverText = typeof unit?.hoverText === "string";
  const hasTokens = Array.isArray(unit?.tokens);
  return hasHoverText && hasTokens && (hasKey || Number.isInteger(index));
};

const adaptBackendHoverUnits = (backendUnits) =>
  backendUnits.map((unit, index) => ({
    type: unit.type === "space" ? "space" : "hover",
    key: unit.key || unit.id || `backend-${index}`,
    text: unit.text || "",
    hoverText: unit.hoverText || "",
    tokens: Array.isArray(unit.tokens) ? unit.tokens : [],
  }));

export const buildHoverUnits = ({ text, backendUnits }) => {
  if (
    Array.isArray(backendUnits) &&
    backendUnits.length > 0 &&
    backendUnits.every((unit, index) => isValidBackendHoverUnit(unit, index))
  ) {
    return adaptBackendHoverUnits(backendUnits);
  }

  return buildFallbackHoverUnits(text);
};

export const buildHoverSpeechPayload = (value) =>
  String(value ?? "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
