import React, { useEffect } from "react";
import "./ReadingCompletionModal.scss";
import heroImage from "../../../../assets/image/reading book and sitting on the grass 1.png";

/**
 * ReadingCompletionModal
 *
 * Props:
 *   isOpen         {boolean}  — hiển thị / ẩn modal
 *   readingMinutes {number}   — số phút đọc, tính từ summary.durationMinutes
 *   focusPercent   {number}   — % tập trung, tính từ FLUENT/TOTAL * 100
 *   onGoLibrary    {function} — callback khi bấm "Quay trở lại thư viện"
 */
const ReadingCompletionModal = ({
  isOpen,
  readingMinutes = 0, 
  focusPercent = 0,
  onGoLibrary,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const displayMinutes = Math.round(readingMinutes);
  const displayFocus = Math.min(100, Math.max(0, Math.round(focusPercent)));

  return (
    <div
      className="rcm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Hoàn thành phiên đọc"
    >
      <div className="rcm-card">
        <span className="rcm-blob rcm-blob--tl" aria-hidden="true" />
        <span className="rcm-blob rcm-blob--br" aria-hidden="true" />

        <div className="rcm-body">
          <img
            src={heroImage}
            alt="Nhân vật đọc sách"
            className="rcm-hero"
          />

          <h2 className="rcm-title">Bạn đã đọc rất tốt hôm nay!</h2>

          <p className="rcm-subtitle">
            Tiếp tục duy trì thói quen đọc sách mỗi ngày nhé.
          </p>

          <div className="rcm-stats">
            <div className="rcm-stat">
              <span className="rcm-stat__value">{displayMinutes}</span>
              <span className="rcm-stat__label">Phút đọc</span>
            </div>
            <div className="rcm-stat">
              <span className="rcm-stat__value">{displayFocus}%</span>
              <span className="rcm-stat__label">Tập trung</span>
            </div>
          </div>

          <button
            type="button"
            className="rcm-btn"
            onClick={onGoLibrary}
          >
            Quay trở lại thư viện
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReadingCompletionModal;