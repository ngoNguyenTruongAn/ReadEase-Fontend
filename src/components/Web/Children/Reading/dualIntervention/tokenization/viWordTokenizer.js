import {
  countHybridVietnameseWords,
  extractHybridVietnameseWordEntries,
  parseHybridVietnameseTokens,
} from "./hybridVietnameseSegmentation";

export const tokenizeVietnameseText = (text) => parseHybridVietnameseTokens(text);

export const extractVietnameseWordEntries = (text) => extractHybridVietnameseWordEntries(text);

export const countVietnameseWords = (input) => {
  const source = Array.isArray(input) ? input.join("") : String(input ?? "");
  return countHybridVietnameseWords(source);
};
