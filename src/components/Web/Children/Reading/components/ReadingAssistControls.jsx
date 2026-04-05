import React from "react";

const ReadingAssistControls = ({
  isBionicEnabled,
  isHoverSpeechEnabled,
  onToggleBionic,
  onToggleHoverSpeech,
}) => {
  return (
    <div className="reading-assist-controls" aria-label="Công cụ hỗ trợ đọc">
      <button
        type="button"
        className={`reading-assist-btn ${isBionicEnabled ? "is-active" : ""}`}
        onClick={onToggleBionic}
        aria-pressed={isBionicEnabled}
      >
        <span className="reading-assist-short" aria-hidden="true">
          B
        </span>
        <span className="reading-assist-full">Bionic Reading</span>
      </button>

      <button
        type="button"
        className={`reading-assist-btn ${isHoverSpeechEnabled ? "is-active" : ""}`}
        onClick={onToggleHoverSpeech}
        aria-pressed={isHoverSpeechEnabled}
      >
        <span className="reading-assist-short" aria-hidden="true">
          H
        </span>
        <span className="reading-assist-full">Hover to Speech</span>
      </button>
    </div>
  );
};

export default ReadingAssistControls;
