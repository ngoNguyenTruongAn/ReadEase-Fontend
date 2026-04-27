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
    expect(wordNodes.map((node) => node.getAttribute("data-raw-token"))).toEqual([
      "con_bò",
      "ăn",
      "cỏ",
    ]);
  });

  it("anchors tooltip to the matching word span when wordIndex is provided", () => {
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
    expect(targetWord.querySelector(".reading-intervention-tooltip")).toBeInTheDocument();
    expect(screen.getByText("hành động ăn")).toBeInTheDocument();
  });

  it("shows floating tooltip fallback when no wordIndex anchor exists", () => {
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
    expect(floatingTooltip).toBeInTheDocument();
    expect(floatingTooltip).toHaveTextContent("con bò");
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
