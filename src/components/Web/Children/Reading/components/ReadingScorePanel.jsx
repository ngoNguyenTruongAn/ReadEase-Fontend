import React from "react";
import { FaStar } from "react-icons/fa";
import defaultAvatar from "../../../../../assets/image/reading book and sitting on the grass 1.png";

const ReadingScorePanel = ({ avatarUrl, score = 0 }) => {
  return (
    <aside className="reading-score-panel" aria-label="Thông tin điểm số">
      <img
        src={avatarUrl || defaultAvatar}
        alt="Avatar"
        className="reading-score-avatar"
      />

      <div className="reading-score-stars" aria-label="Điểm sao">
        <FaStar className="reading-score-star" />
        <span className="reading-score-value">{score}</span>
      </div>
    </aside>
  );
};

export default ReadingScorePanel;
