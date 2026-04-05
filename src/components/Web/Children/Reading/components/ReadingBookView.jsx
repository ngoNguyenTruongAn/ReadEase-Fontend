import React, { useMemo } from "react";
import { buildHoverUnits } from "../hoverSpeechUnits";

const isWhitespaceToken = (token) => /^\s+$/.test(token);

const renderWordPiece = ({ token, useBionic, key }) => {
  if (isWhitespaceToken(token)) {
    return (
      <span key={key} className="reading-word-space">
        {token}
      </span>
    );
  }

  if (!useBionic) {
    return (
      <span key={key} className="reading-word">
        {token}
      </span>
    );
  }

  const focusLength = Math.max(1, Math.ceil(token.length * 0.45));
  return (
    <span key={key} className="reading-word">
      <strong>{token.slice(0, focusLength)}</strong>
      {token.slice(focusLength)}
    </span>
  );
};

const ReadingBookView = ({
  pageText,
  useBionic,
  isHoverSpeechEnabled,
  backendHoverUnits,
  onWordHoverStart,
  onWordHoverEnd,
}) => {
  const handleWordTrackingMouseMove = (event) => {
    if (!isHoverSpeechEnabled) return;

    const hoveredUnitNode = event.target.closest(".reading-hover-unit");
    if (!hoveredUnitNode) return;

    const hoverText = hoveredUnitNode.getAttribute("data-reading-hover-text") || "";
    if (!hoverText) return;

    onWordHoverStart?.(hoverText);
  };

  const hoverUnits = useMemo(
    () => buildHoverUnits({ text: pageText, backendUnits: backendHoverUnits }),
    [backendHoverUnits, pageText],
  );
  const content = hoverUnits.map((unit) => {
    if (unit.type === "space") {
      return (
        <span key={unit.key} className="reading-word-space">
          {unit.text}
        </span>
      );
    }

    return (
      <span
        key={unit.key}
        className="reading-hover-unit"
        data-reading-hover-text={unit.hoverText}
        onMouseEnter={() => onWordHoverStart?.(unit.hoverText)}
      >
        {unit.tokens.map((token, tokenIndex) =>
          renderWordPiece({
            token,
            useBionic,
            key: `${unit.key}-${tokenIndex}`,
          }),
        )}
      </span>
    );
  });

  const articleClassName = [
    "reading-book-view",
    isHoverSpeechEnabled ? "is-hover-speech-enabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={articleClassName}
      aria-label="Nội dung truyện"
      onMouseMove={handleWordTrackingMouseMove}
      onMouseLeave={() => onWordHoverEnd?.()}
    >
      <p className="reading-book-text">{content}</p>
    </article>
  );
};

export default ReadingBookView;
