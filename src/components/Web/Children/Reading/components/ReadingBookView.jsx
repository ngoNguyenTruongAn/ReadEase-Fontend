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
const LONG_WORD_WRAP_FALLBACK_GRAPHEME_LIMIT = 32;

// Khởi tạo 1 lần ở module scope để tránh chi phí new Intl.Segmenter() mỗi lần render.
// Fallback về spread [...str] nếu môi trường không hỗ trợ Intl.Segmenter —
// spread tách đúng surrogate pairs dù không xử lý dấu tổ hợp NFD,
// nhưng vẫn an toàn hơn .split("").
const VI_GRAPHEME_SEGMENTER =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("vi", { granularity: "grapheme" })
    : null;

const getGraphemes = (str) => {
  if (VI_GRAPHEME_SEGMENTER) {
    return [...VI_GRAPHEME_SEGMENTER.segment(str)].map((s) => s.segment);
  }
  return [...str];
};

const shouldUseLongWordWrapFallback = (tokenText) =>
  getGraphemes(String(tokenText ?? "").normalize("NFC")).length >
  LONG_WORD_WRAP_FALLBACK_GRAPHEME_LIMIT;

// Áp dụng bionic cho 1 âm tiết đơn (không chứa space).
// Normalize NFC bắt buộc vì pipeline segmentation không normalize —
// nếu backend trả NFD thì .slice() thô sẽ cắt giữa tổ hợp dấu.
const applyBionicToSyllable = (syllable) => {
  const normalized = syllable.normalize("NFC");
  const graphemes = getGraphemes(normalized);

  // Từ đơn âm ngắn ≤3 grapheme (bò, đi, xe...): chỉ bold 1 grapheme đầu.
  // Từ dài hơn: bold 45% — phù hợp hơn 50% gốc cho tiếng Việt có thanh điệu.
  const boldCount =
    graphemes.length <= 3
      ? 1
      : Math.max(1, Math.ceil(graphemes.length * 0.45));

  return {
    bold: graphemes.slice(0, boldCount).join(""),
    rest: graphemes.slice(boldCount).join(""),
  };
};

const renderWordPiece = ({ token, useBionic }) => {
  if (!useBionic) {
    return token;
  }

  // displayText của từ ghép segmented (học_sinh → "học sinh") chứa space ở giữa.
  // Áp bionic riêng từng âm tiết để tránh bold cả space và tính sai grapheme count.
  const syllables = token.split(" ");

  if (syllables.length > 1) {
    return (
      <>
        {syllables.map((syllable, index) => {
          const { bold, rest } = applyBionicToSyllable(syllable);
          return (
            <React.Fragment key={index}>
              {index > 0 && " "}
              <strong>{bold}</strong>
              {rest}
            </React.Fragment>
          );
        })}
      </>
    );
  }

  const { bold, rest } = applyBionicToSyllable(token);
  return (
    <>
      <strong>{bold}</strong>
      {rest}
    </>
  );
};

const ReadingBookView = ({
  pageText,
  pageSegmentedText,
  useBionic,
  isHoverSpeechEnabled,
  visualFlags,
  wordIntervention,
  onWordHoverStart,
  onWordHoverEnd,
  onStoryPointerMove,
  onStoryPointerLeave,
}) => {
  const wordElementRef = useRef(new Map());
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

  // ← log sự kiện
  useEffect(() => {
    if (!wordIntervention) return;
    console.log("[RegressionDebug]", Date().now, JSON.stringify(wordIntervention, null, 2));
  }, [wordIntervention]);

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
  const isColorBandingActive =
    Boolean(visualFlags?.isVisualActive) &&
    Boolean(visualFlags?.isColorBandingEnabled) &&
    hasInterventionTargets;

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
    const wordText = token.displayText || token.value;
    const shouldAllowWordWrapFallback = shouldUseLongWordWrapFallback(wordText);

    const isRegressionStrongRange = regressionRangeIndexSet?.has(wordIndex) ?? false;
    const isRegressionLoopFocus =
      regressionType === "LOOP" && wordIndex === regressionWordIndex;

    // STRONG/STALL range words reuse the same paint-only target band.
    // exactly like a single-word intervention — no new CSS needed.
    const isRegressionInterventionWord = isRegressionStrongRange || isRegressionLoopFocus;

    const wordClassName = [
      "reading-word",
      shouldAllowWordWrapFallback ? "reading-word--wrap-fallback" : "reading-word--atomic",
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
        data-wrap-mode={shouldAllowWordWrapFallback ? "fallback" : "atomic"}
        onMouseEnter={(event) => {
          triggerHoverSpeechFromWordNode(event.currentTarget);
        }}
      >
        {renderWordPiece({
          token: wordText,
          useBionic,
        })}
      </span>
    );
  });

  const articleStyle = createVisualStyleVars(visualFlags);

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
    </article>
  );
};

export default ReadingBookView;
