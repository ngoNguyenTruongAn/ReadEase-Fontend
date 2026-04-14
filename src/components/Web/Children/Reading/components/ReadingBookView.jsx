import React, { useEffect, useMemo, useRef } from "react";
import {
  buildHybridHoverSpeechText,
  parseHybridVietnameseTokens,
} from "../dualIntervention/tokenization/hybridVietnameseSegmentation";
import { createVisualStyleVars, VISUAL_MODES } from "../dualIntervention/styleStateManager";

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

  const content = pageTokens.map((token) => {
    if (token.type === "newline") {
      return <br key={token.id} />;
    }

    if (token.type === "space") {
      return (
        <span key={token.id} className="reading-word-space">
          {token.value}
        </span>
      );
    }

    if (token.type !== "word") {
      return (
        <span key={token.id} className="reading-punctuation">
          {token.value}
        </span>
      );
    }

    const wordIndex = token.wordIndex;
    const hoverText = hoverTextByWordIndex.get(wordIndex) || token.displayText || token.value;

    const wordClassName = [
      "reading-word",
      wordIntervention?.distractionWordIndex === wordIndex ? "word-distract-hint" : "",
      wordIntervention?.regressionWordIndex === wordIndex ? "word-regression-focus" : "",
      wordIntervention?.semanticWordIndex === wordIndex ? "word-semantic-target" : "",
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
    visualFlags?.isVisualActive ? "is-visual-adaptation-active" : "",
    visualFlags?.isLetterSpacingExpanded ? "visual-letter-spacing-expanded" : "",
    visualFlags?.isColorBandingEnabled ? "visual-color-banding" : "",
    visualFlags?.isInvertedDeep ? "visual-inverted-deep" : "",
    visualFlags?.mode === VISUAL_MODES.DUAL_INTERVENTION ? "visual-dual-intervention" : "",
    visualFlags?.mode === VISUAL_MODES.VISUAL_ONLY ? "visual-visual-only" : "",
    visualFlags?.confidenceClassName || "",
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
      <p className="reading-book-text">{content}</p>

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
