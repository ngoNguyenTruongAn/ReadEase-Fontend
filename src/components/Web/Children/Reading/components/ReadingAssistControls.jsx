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
      >
        B
      </button>

      <button
        type="button"
        className={`reading-assist-btn ${isHoverSpeechEnabled ? "is-active" : ""}`}
        onClick={onToggleHoverSpeech}
      >
        H
      </button>
    </div>
  );
};

export default ReadingAssistControls;
