import React from "react";

const createBionicTokens = (text) => {
  const words = String(text ?? "").split(/(\s+)/);

  return words.map((word, index) => {
    if (/^\s+$/.test(word) || !word) {
      return (
        <span key={`space-${index}`} className="reading-word-space">
          {word}
        </span>
      );
    }

    const focusLength = Math.max(1, Math.ceil(word.length * 0.45));
    return (
      <span key={`word-${index}`} className="reading-word">
        <strong>{word.slice(0, focusLength)}</strong>
        {word.slice(focusLength)}
      </span>
    );
  });
};

const ReadingBookView = ({ pageText, useBionic, onHoverStart, onHoverEnd }) => {
  const content = useBionic ? createBionicTokens(pageText) : pageText;

  return (
    <article
      className="reading-book-view"
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      aria-label="Nội dung truyện"
    >
      <p className="reading-book-text">{content}</p>
    </article>
  );
};

export default ReadingBookView;
