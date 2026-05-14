import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReadingBookView from "./ReadingBookView";

describe("ReadingBookView word index mapping", () => {
  it("renders segmented compound words as single spans with stable wordIndex", () => {
    const { container } = render(
      <ReadingBookView
        pageText="con bò ăn cỏ"
        pageSegmentedText="con_bò ăn cỏ"
        useBionic={false}
        isHoverSpeechEnabled={false}
        visualFlags={null}
        wordIntervention={null}
        activeTooltip={null}
        onWordHoverStart={() => {}}
        onWordHoverEnd={() => {}}
        onStoryPointerMove={() => {}}
        onTooltipRendered={() => {}}
      />,
    );

    expect(screen.getByLabelText("Nội dung truyện")).toHaveTextContent("con bò ăn cỏ");

    const wordNodes = Array.from(container.querySelectorAll(".reading-word[data-word-index]"));
    expect(wordNodes).toHaveLength(3);
    expect(wordNodes.map((node) => node.getAttribute("data-word-index"))).toEqual(["0", "1", "2"]);
    expect(wordNodes[0]).toHaveClass("reading-word--atomic");
    expect(wordNodes[0]).toHaveAttribute("data-wrap-mode", "atomic");
    expect(wordNodes.map((node) => node.getAttribute("data-raw-token"))).toEqual([
      "con_bò",
      "ăn",
      "cỏ",
    ]);
  });

  it("uses wrapping fallback only for unusually long word tokens", () => {
    const longToken = "supercalifragilisticexpialidociousx";

    const { container } = render(
      <ReadingBookView
        pageText={longToken}
        pageSegmentedText={longToken}
        useBionic={false}
        isHoverSpeechEnabled={false}
        visualFlags={null}
        wordIntervention={null}
        activeTooltip={null}
        onWordHoverStart={() => {}}
        onWordHoverEnd={() => {}}
        onStoryPointerMove={() => {}}
        onTooltipRendered={() => {}}
      />,
    );

    const wordNode = container.querySelector(".reading-word[data-word-index='0']");
    expect(wordNode).toBeInTheDocument();
    expect(wordNode).toHaveClass("reading-word--wrap-fallback");
    expect(wordNode).toHaveAttribute("data-wrap-mode", "fallback");
  });

  it("renders quoted text without extra spaces inside quote marks", () => {
    const { container } = render(
      <ReadingBookView
        pageText={'" Con vao rung " . Anh noi'}
        pageSegmentedText={'" Con vao rung " . Anh noi'}
        useBionic={false}
        isHoverSpeechEnabled={false}
        visualFlags={null}
        wordIntervention={null}
        activeTooltip={null}
        onWordHoverStart={() => {}}
        onWordHoverEnd={() => {}}
        onStoryPointerMove={() => {}}
        onTooltipRendered={() => {}}
      />,
    );

    expect(container.querySelector(".reading-book-view")).toHaveTextContent('"Con vao rung". Anh noi');

    const wordNodes = Array.from(container.querySelectorAll(".reading-word[data-word-index]"));
    expect(wordNodes.map((node) => node.getAttribute("data-word-index"))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("does not render inline tooltip content when tooltip data is provided", () => {
    const { container } = render(
      <ReadingBookView
        pageText="con bò ăn cỏ"
        pageSegmentedText="con_bò ăn cỏ"
        useBionic={false}
        isHoverSpeechEnabled={false}
        visualFlags={null}
        wordIntervention={null}
        activeTooltip={{
          id: "tooltip-1",
          visible: true,
          anchorType: "word",
          wordIndex: 1,
          original: "ăn",
          simplified: "hành động ăn",
        }}
        onWordHoverStart={() => {}}
        onWordHoverEnd={() => {}}
        onStoryPointerMove={() => {}}
        onTooltipRendered={() => {}}
      />,
    );

    const targetWord = container.querySelector('.reading-word[data-word-index="1"]');
    expect(targetWord).toBeInTheDocument();
    expect(targetWord).toHaveTextContent("ăn");
    expect(targetWord.querySelector(".reading-intervention-tooltip")).not.toBeInTheDocument();
    expect(screen.queryByText("hành động ăn")).not.toBeInTheDocument();
  });

  it("does not render floating tooltip content when cursor tooltip data is provided", () => {
    render(
      <ReadingBookView
        pageText="con bò ăn cỏ"
        pageSegmentedText="con_bò ăn cỏ"
        useBionic={false}
        isHoverSpeechEnabled={false}
        visualFlags={null}
        wordIntervention={null}
        activeTooltip={{
          id: "tooltip-2",
          visible: true,
          anchorType: "cursor",
          wordIndex: null,
          cursorX: 320,
          cursorY: 220,
          original: "con bò",
          simplified: "con bò",
        }}
        onWordHoverStart={() => {}}
        onWordHoverEnd={() => {}}
        onStoryPointerMove={() => {}}
        onTooltipRendered={() => {}}
      />,
    );

    const floatingTooltip = document.querySelector(".reading-floating-tooltip");
    expect(floatingTooltip).not.toBeInTheDocument();
  });

  it("uses hybrid segmented word text for hover-to-speech and dedupes repeated hovers", () => {
    const onWordHoverStart = vi.fn();
    const onWordHoverEnd = vi.fn();

    const { container } = render(
      <ReadingBookView
        pageText="con bò ăn cỏ"
        pageSegmentedText="con_bò ăn cỏ"
        useBionic={false}
        isHoverSpeechEnabled
        visualFlags={null}
        wordIntervention={null}
        activeTooltip={null}
        onWordHoverStart={onWordHoverStart}
        onWordHoverEnd={onWordHoverEnd}
        onStoryPointerMove={() => {}}
        onTooltipRendered={() => {}}
      />,
    );

    const firstWord = container.querySelector('.reading-word[data-word-index="0"]');
    expect(firstWord).toBeInTheDocument();

    fireEvent.mouseEnter(firstWord);
    fireEvent.mouseEnter(firstWord);

    expect(onWordHoverStart).toHaveBeenCalledTimes(1);
    expect(onWordHoverStart).toHaveBeenCalledWith("con bò");

    fireEvent.pointerLeave(screen.getByLabelText("Nội dung truyện"));
    expect(onWordHoverEnd).toHaveBeenCalledTimes(1);
  });
});
