import {
  extractHybridVietnameseWordEntries,
  parseHybridVietnameseTokens,
  resolveSegmentedTextInput,
} from "./hybridVietnameseSegmentation";
import { describe, expect, it } from "vitest";

describe("hybridVietnameseSegmentation", () => {
  it("parses segmented text and keeps compound words as one token", () => {
    const tokens = parseHybridVietnameseTokens("con_bò ăn cỏ");
    const words = tokens.filter((token) => token.type === "word");

    expect(words).toHaveLength(3);
    expect(words[0]).toMatchObject({
      rawToken: "con_bò",
      displayText: "con bò",
      wordIndex: 0,
      paragraphIndex: 0,
    });
    expect(words[1]).toMatchObject({
      displayText: "ăn",
      wordIndex: 1,
      paragraphIndex: 0,
    });
    expect(words[2]).toMatchObject({
      displayText: "cỏ",
      wordIndex: 2,
      paragraphIndex: 0,
    });
  });

  it("preserves paragraph index across newlines", () => {
    const entries = extractHybridVietnameseWordEntries("con_bò ăn cỏ\nbầu_trời xanh");

    expect(entries.map((entry) => entry.value)).toEqual([
      "con bò",
      "ăn",
      "cỏ",
      "bầu trời",
      "xanh",
    ]);
    expect(entries.map((entry) => entry.paragraphIndex)).toEqual([0, 0, 0, 1, 1]);
  });

  it("falls back to raw body when segmented text is missing", () => {
    const source = resolveSegmentedTextInput({
      bodySegmented: null,
      body: "con bò ăn cỏ",
    });

    const entries = extractHybridVietnameseWordEntries(source);
    expect(entries.map((entry) => entry.value)).toEqual(["con", "bò", "ăn", "cỏ"]);
  });

  it("normalizes punctuation spacing from segmented ML output", () => {
    const malformedSegmentedText =
      "Người chủ cho rằng lừa đã già và giếng cũng cần lấp ,nên quyết định lấp đất xuống giếng .";

    const tokens = parseHybridVietnameseTokens(malformedSegmentedText);
    const renderedText = tokens.map((token) => token.value).join("");

    expect(renderedText).toContain("lấp, nên");
    expect(renderedText).toContain("giếng.");
    expect(renderedText).not.toContain("lấp ,");
    expect(renderedText).not.toContain("giếng .");
  });
});
