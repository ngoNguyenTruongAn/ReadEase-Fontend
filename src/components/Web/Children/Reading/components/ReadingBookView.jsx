import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildHybridHoverSpeechText,
  parseHybridVietnameseTokens,
} from "../dualIntervention/tokenization/hybridVietnameseSegmentation";
import { createVisualStyleVars } from "../dualIntervention/styleStateManager";

const INTERVENTION_WORD_INDEX_KEYS = [
  "distractionWordIndex",
  "regressionWordIndex",
  "semanticWordIndex",
];

const LINE_DETECTION_TOLERANCE_PX = 14;

const renderWordPiece = ({ token, useBionic }) => {
  if (!useBionic) {
    return token;
  }

  const focusLength = Math.max(1, Math.ceil(token.length * 0.45));
  return (
    <>
      <strong>{token.slice(0, focusLength)}</strong>
      {token.slice(focusLength)}
    </>
  );
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const buildCursorTooltipStyle = ({ tooltip }) => {
  if (!tooltip?.visible) return null;
  if (tooltip.anchorType !== "cursor") return null;

  if (!Number.isFinite(tooltip.cursorX) || !Number.isFinite(tooltip.cursorY)) {
    return {
      left: "50%",
      top: "12px",
      transform: "translate(-50%, 0)",
    };
  }

  const viewportMaxX = typeof window !== "undefined" ? Math.max(window.innerWidth - 16, 16) : 2048;
  const viewportMaxY = typeof window !== "undefined" ? Math.max(window.innerHeight - 12, 12) : 2048;

  return {
    left: `${clamp(tooltip.cursorX, 16, viewportMaxX)}px`,
    top: `${clamp(tooltip.cursorY - 18, 12, viewportMaxY)}px`,
    transform: "translate(-50%, -100%)",
  };
};

const ReadingBookView = ({
  pageText,
  pageSegmentedText,
  useBionic,
  isHoverSpeechEnabled,
  visualFlags,
  wordIntervention,
  activeTooltip,
  onWordHoverStart,
  onWordHoverEnd,
  onStoryPointerMove,
  onStoryPointerLeave,
  onTooltipRendered,
}) => {
  const wordElementRef = useRef(new Map());
  const renderedTooltipIdRef = useRef("");
  const lastHoveredWordIndexRef = useRef(null);
  const [lineIndexByWord, setLineIndexByWord] = useState({});

  const parsedSourceText = pageSegmentedText || pageText;
  const pageTokens = useMemo(() => parseHybridVietnameseTokens(parsedSourceText), [parsedSourceText]);

  const hoverTextByWordIndex = useMemo(() => {
    const map = new Map();
    pageTokens.forEach((token) => {
      if (token.type !== "word") return;

      const normalizedHoverText = buildHybridHoverSpeechText(token.rawToken || token.displayText || token.value);
      map.set(token.wordIndex, normalizedHoverText || token.displayText || token.value);
    });
    return map;
  }, [pageTokens]);

  // Regression-specific derived state — does not affect any existing logic above.
  const regressionType = wordIntervention?.regressionType ?? null;
  const regressionWordIndex = wordIntervention?.regressionWordIndex ?? null;
  const regressionFocusRadius = wordIntervention?.regressionFocusRadius ?? 0;

  // For STRONG: set of wordIndexes in the regression range to highlight as a block.
  const regressionRangeIndexSet = useMemo(() => {
    if (regressionType !== "STRONG" || !Number.isInteger(regressionWordIndex)) {
      return null;
    }

    const rangeSet = new Set();
    const rangeEnd = regressionWordIndex + regressionFocusRadius;

    pageTokens.forEach((token) => {
      if (token.type !== "word" || !Number.isInteger(token.wordIndex)) return;
      if (token.wordIndex >= regressionWordIndex && token.wordIndex <= rangeEnd) {
        rangeSet.add(token.wordIndex);
      }
    });

    return rangeSet;
  }, [regressionType, regressionWordIndex, regressionFocusRadius, pageTokens]);

  const interventionWordIndexes = useMemo(() => {
    const indexSet = new Set();

    INTERVENTION_WORD_INDEX_KEYS.forEach((key) => {
      const value = wordIntervention?.[key];
      if (Number.isInteger(value) && value >= 0) {
        indexSet.add(value);
      }
    });

    // STRONG/STALL: feed the full regression range so every word in the range
    // gets picked up by bandedLineIndexSet → color banding fires on those lines
    // exactly as it does for single-word interventions. No banding logic changes.
    if (regressionRangeIndexSet) {
      regressionRangeIndexSet.forEach((idx) => indexSet.add(idx));
    }

    // LOOP: only the focus word enters the set — surrounding words are dimmed,
    // not highlighted, so they must stay out of interventionWordIndexes.
    if (!regressionRangeIndexSet && Number.isInteger(regressionWordIndex) && regressionWordIndex >= 0) {
      indexSet.add(regressionWordIndex);
    }

    return Array.from(indexSet).sort((left, right) => left - right);
  }, [wordIntervention, regressionRangeIndexSet, regressionWordIndex]);

  const interventionWordIndexSet = useMemo(
    () => new Set(interventionWordIndexes),
    [interventionWordIndexes],
  );

  const hasInterventionTargets = interventionWordIndexes.length > 0;
  const isInterventionActive =
    Boolean(visualFlags?.isVisualActive) && hasInterventionTargets;
  const isColorBandingActive = hasInterventionTargets;

  const recalculateLineIndexByWord = useCallback(() => {
    if (!isColorBandingActive) {
      setLineIndexByWord({});
      return;
    }

    const orderedWordEntries = Array.from(wordElementRef.current.entries())
      .filter(([, element]) => Boolean(element?.isConnected))
      .sort(([leftWordIndex], [rightWordIndex]) => leftWordIndex - rightWordIndex);

    if (!orderedWordEntries.length) {
      setLineIndexByWord({});
      return;
    }

    const nextLineIndexByWord = {};
    let lineIndex = -1;
    let currentLineTop = null;
    let currentLineTopSampleCount = 0;

    orderedWordEntries.forEach(([wordIndex, element]) => {
      const rectTop = element.getBoundingClientRect?.().top;
      const fallbackTop = Number(element.offsetTop);
      const top = Number.isFinite(rectTop) ? rectTop : fallbackTop;

      if (!Number.isFinite(top)) return;

      const isNewLine =
        currentLineTop === null || Math.abs(top - currentLineTop) > LINE_DETECTION_TOLERANCE_PX;

      if (isNewLine) {
        lineIndex += 1;
        currentLineTop = top;
        currentLineTopSampleCount = 1;
      } else {
        currentLineTop =
          (currentLineTop * currentLineTopSampleCount + top) /
          (currentLineTopSampleCount + 1);
        currentLineTopSampleCount += 1;
      }

      nextLineIndexByWord[wordIndex] = lineIndex;
    });

    setLineIndexByWord((previousMap) => {
      const previousKeys = Object.keys(previousMap);
      const nextKeys = Object.keys(nextLineIndexByWord);

      if (
        previousKeys.length === nextKeys.length &&
        nextKeys.every((key) => previousMap[key] === nextLineIndexByWord[key])
      ) {
        return previousMap;
      }

      return nextLineIndexByWord;
    });
  }, [isColorBandingActive]);

  useLayoutEffect(() => {
    const animationFrameId = window.requestAnimationFrame(() => {
      recalculateLineIndexByWord();
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [recalculateLineIndexByWord, pageTokens, interventionWordIndexes]);

  useEffect(() => {
    if (!isColorBandingActive) return undefined;

    const resizeHandler = () => {
      window.requestAnimationFrame(recalculateLineIndexByWord);
    };

    window.addEventListener("resize", resizeHandler);

    return () => {
      window.removeEventListener("resize", resizeHandler);
    };
  }, [isColorBandingActive, recalculateLineIndexByWord]);

  useEffect(() => {
    if (!isColorBandingActive) return undefined;

    const deferredMeasureTimer = window.setTimeout(() => {
      recalculateLineIndexByWord();
    }, 520);

    return () => {
      window.clearTimeout(deferredMeasureTimer);
    };
  }, [isColorBandingActive, recalculateLineIndexByWord, interventionWordIndexes]);

  const bandedLineIndexSet = useMemo(() => {
    if (!isColorBandingActive) return new Set();

    const targetedLineIndexes = interventionWordIndexes
      .map((wordIndex) => lineIndexByWord[wordIndex])
      .filter((lineIndex) => Number.isInteger(lineIndex));

    if (!targetedLineIndexes.length) {
      return new Set();
    }

    const uniqueLineIndexes = Array.from(new Set(targetedLineIndexes)).sort(
      (left, right) => left - right,
    );

    return new Set(uniqueLineIndexes);
  }, [interventionWordIndexes, isColorBandingActive, lineIndexByWord]);

  const triggerHoverSpeechFromWordNode = (wordNode) => {
    if (!isHoverSpeechEnabled) return;

    if (!wordNode) {
      if (lastHoveredWordIndexRef.current !== null) {
        lastHoveredWordIndexRef.current = null;
        onWordHoverEnd?.();
      }
      return;
    }

    const wordIndexAttr = wordNode.getAttribute("data-word-index");
    const wordIndex = Number.parseInt(wordIndexAttr || "", 10);
    if (!Number.isInteger(wordIndex)) {
      return;
    }

    if (lastHoveredWordIndexRef.current === wordIndex) {
      return;
    }

    const hoverTextRaw = wordNode.getAttribute("data-reading-hover-text") || "";
    const hoverText = buildHybridHoverSpeechText(hoverTextRaw);
    if (!hoverText) {
      lastHoveredWordIndexRef.current = null;
      onWordHoverEnd?.();
      return;
    }

    lastHoveredWordIndexRef.current = wordIndex;
    onWordHoverStart?.(hoverText);
  };

  const handleWordTrackingPointerMove = (event) => {
    onStoryPointerMove?.(event);
    if (!isHoverSpeechEnabled) return;

    const hoveredWordNode = event.target.closest(".reading-word[data-word-index]");
    triggerHoverSpeechFromWordNode(hoveredWordNode);
  };

  useEffect(() => {
    if (!activeTooltip?.visible) {
      return;
    }

    const hasWordAnchor =
      Number.isInteger(activeTooltip.wordIndex) &&
      wordElementRef.current.has(activeTooltip.wordIndex);
    const hasCursorAnchor = activeTooltip.anchorType === "cursor";
    const hasViewportAnchor = activeTooltip.anchorType === "viewport";

    if (!hasWordAnchor && !hasCursorAnchor && !hasViewportAnchor) {
      return;
    }

    if (renderedTooltipIdRef.current !== activeTooltip.id) {
      renderedTooltipIdRef.current = activeTooltip.id;
      onTooltipRendered?.(activeTooltip);
    }
  }, [activeTooltip, onTooltipRendered]);

  const lineIndexByTokenId = useMemo(() => {
    const tokenLineMap = {};
    let lastResolvedLineIndex = null;

    pageTokens.forEach((token) => {
      if (token.type === "newline") {
        lastResolvedLineIndex = null;
        tokenLineMap[token.id] = null;
        return;
      }

      if (token.type === "word") {
        const resolvedWordLineIndex = lineIndexByWord[token.wordIndex];

        if (Number.isInteger(resolvedWordLineIndex)) {
          lastResolvedLineIndex = resolvedWordLineIndex;
        }

        tokenLineMap[token.id] = Number.isInteger(resolvedWordLineIndex)
          ? resolvedWordLineIndex
          : lastResolvedLineIndex;
        return;
      }

      tokenLineMap[token.id] = lastResolvedLineIndex;
    });

    return tokenLineMap;
  }, [lineIndexByWord, pageTokens]);

  const nearestWordIndexByTokenId = useMemo(() => {
    const previousWordByPosition = [];
    let previousWordIndex = null;

    pageTokens.forEach((token, tokenPosition) => {
      if (token.type === "word" && Number.isInteger(token.wordIndex)) {
        previousWordIndex = token.wordIndex;
      }

      previousWordByPosition[tokenPosition] = previousWordIndex;
    });

    const nextWordByPosition = [];
    let nextWordIndex = null;

    for (let tokenPosition = pageTokens.length - 1; tokenPosition >= 0; tokenPosition -= 1) {
      const token = pageTokens[tokenPosition];
      if (token.type === "word" && Number.isInteger(token.wordIndex)) {
        nextWordIndex = token.wordIndex;
      }

      nextWordByPosition[tokenPosition] = nextWordIndex;
    }

    const tokenWordMap = {};

    pageTokens.forEach((token, tokenPosition) => {
      if (token.type === "word" && Number.isInteger(token.wordIndex)) {
        tokenWordMap[token.id] = token.wordIndex;
        return;
      }

      const previousWord = previousWordByPosition[tokenPosition];
      const nextWord = nextWordByPosition[tokenPosition];

      if (Number.isInteger(previousWord)) {
        tokenWordMap[token.id] = previousWord;
        return;
      }

      if (Number.isInteger(nextWord)) {
        tokenWordMap[token.id] = nextWord;
      }
    });

    return tokenWordMap;
  }, [pageTokens]);

  const content = pageTokens.map((token, tokenPosition) => {
    const tokenLineIndex = lineIndexByTokenId[token.id];
    const previousToken = tokenPosition > 0 ? pageTokens[tokenPosition - 1] : null;
    const nextToken = tokenPosition < pageTokens.length - 1 ? pageTokens[tokenPosition + 1] : null;
    const previousLineIndex = previousToken ? lineIndexByTokenId[previousToken.id] : null;
    const nextLineIndex = nextToken ? lineIndexByTokenId[nextToken.id] : null;
    const isBandingLine = Number.isInteger(tokenLineIndex) && bandedLineIndexSet.has(tokenLineIndex);
    const isBandingStart =
      isBandingLine && (!Number.isInteger(previousLineIndex) || previousLineIndex !== tokenLineIndex);
    const isBandingEnd =
      isBandingLine && (!Number.isInteger(nextLineIndex) || nextLineIndex !== tokenLineIndex);

    if (token.type === "newline") {
      return <br key={token.id} />;
    }

    if (token.type === "space") {
      const relatedWordIndex = nearestWordIndexByTokenId[token.id];
      const spaceClassName = [
        "reading-word-space",
        isBandingLine ? "color-banding-active" : "",
        isBandingStart ? "line-banding-start" : "",
        isBandingEnd ? "line-banding-end" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <span
          key={token.id}
          className={spaceClassName}
          data-word-index={Number.isInteger(relatedWordIndex) ? relatedWordIndex : undefined}
        >
          {token.value}
        </span>
      );
    }

    if (token.type !== "word") {
      const relatedWordIndex = nearestWordIndexByTokenId[token.id];
      const punctuationClassName = [
        "reading-punctuation",
        isBandingLine ? "color-banding-active" : "",
        isBandingStart ? "line-banding-start" : "",
        isBandingEnd ? "line-banding-end" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <span
          key={token.id}
          className={punctuationClassName}
          data-word-index={Number.isInteger(relatedWordIndex) ? relatedWordIndex : undefined}
        >
          {token.value}
        </span>
      );
    }

    const wordIndex = token.wordIndex;
    const isInterventionTargetWord = interventionWordIndexSet.has(wordIndex);

    const hoverText = hoverTextByWordIndex.get(wordIndex) || token.displayText || token.value;

    const isRegressionStrongRange = regressionRangeIndexSet?.has(wordIndex) ?? false;
    const isRegressionLoopFocus =
      regressionType === "LOOP" && wordIndex === regressionWordIndex;

    // STRONG/STALL range words reuse intervention-target-word (bold + letter-spacing)
    // exactly like a single-word intervention — no new CSS needed.
    const isRegressionInterventionWord = isRegressionStrongRange || isRegressionLoopFocus;

    const wordClassName = [
      "reading-word",
      isInterventionTargetWord || isRegressionInterventionWord ? "intervention-target-word" : "",
      isBandingLine ? "color-banding-active" : "",
      isBandingStart ? "line-banding-start" : "",
      isBandingEnd ? "line-banding-end" : "",
      wordIntervention?.distractionWordIndex === wordIndex ? "word-distract-hint" : "",
      wordIntervention?.regressionWordIndex === wordIndex ? "word-regression-focus" : "",
      wordIntervention?.semanticWordIndex === wordIndex ? "word-semantic-target" : "",
      // Regression type modifiers — layered on top of word-regression-focus, no conflicts.
      regressionType === "MILD" && wordIndex === regressionWordIndex
        ? "word-regression--mild"
        : "",
      isRegressionStrongRange ? "word-regression--strong" : "",
      isRegressionLoopFocus ? "word-regression--loop-focus" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span
        key={token.id}
        ref={(element) => {
          if (element) {
            wordElementRef.current.set(wordIndex, element);
          } else {
            wordElementRef.current.delete(wordIndex);
          }
        }}
        className={wordClassName}
        data-word-index={wordIndex}
        data-raw-token={token.rawToken || token.value}
        data-reading-hover-text={hoverText}
        onMouseEnter={(event) => {
          triggerHoverSpeechFromWordNode(event.currentTarget);
        }}
      >
        {renderWordPiece({
          token: token.displayText || token.value,
          useBionic,
        })}

        {activeTooltip?.visible &&
          activeTooltip?.anchorType !== "cursor" &&
          activeTooltip?.wordIndex === wordIndex && (
          <span className="reading-inline-tooltip-anchor">
            <span className="reading-intervention-tooltip" role="status" aria-live="polite">
              {activeTooltip?.original && (
                <span className="reading-tooltip-original">{activeTooltip.original}</span>
              )}
              {activeTooltip?.simplified && (
                <span className="reading-tooltip-simplified">{activeTooltip.simplified}</span>
              )}
            </span>
          </span>
          )}
      </span>
    );
  });

  const articleStyle = createVisualStyleVars(visualFlags);
  const cursorTooltipStyle = buildCursorTooltipStyle({ tooltip: activeTooltip });

  const articleClassName = [
    "reading-book-view",
    isHoverSpeechEnabled ? "is-hover-speech-enabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const textClassName = [
    "reading-book-text",
    isInterventionActive ? "intervention-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={articleClassName}
      style={articleStyle}
      aria-label="Nội dung truyện"
      onPointerMove={handleWordTrackingPointerMove}
      onPointerLeave={() => {
        lastHoveredWordIndexRef.current = null;
        onWordHoverEnd?.();
        onStoryPointerLeave?.();
      }}
    >
      <p className={textClassName}>{content}</p>

      {activeTooltip?.visible && activeTooltip?.anchorType === "cursor" && (
        <div
          className="reading-intervention-tooltip reading-floating-tooltip"
          role="status"
          aria-live="polite"
          style={cursorTooltipStyle || undefined}
        >
          {activeTooltip?.original && (
            <span className="reading-tooltip-original">{activeTooltip.original}</span>
          )}
          {activeTooltip?.simplified && (
            <span className="reading-tooltip-simplified">{activeTooltip.simplified}</span>
          )}
        </div>
      )}

      {activeTooltip?.visible && activeTooltip?.anchorType === "viewport" && (
        <div className="reading-intervention-tooltip reading-floating-tooltip reading-floating-tooltip--viewport">
          {activeTooltip?.original && (
            <span className="reading-tooltip-original">{activeTooltip.original}</span>
          )}
          {activeTooltip?.simplified && (
            <span className="reading-tooltip-simplified">{activeTooltip.simplified}</span>
          )}
        </div>
      )}
    </article>
  );
};

export default ReadingBookView;