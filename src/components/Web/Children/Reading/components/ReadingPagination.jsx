import React from "react";
import { FaChevronCircleLeft, FaChevronCircleRight } from "react-icons/fa";

const ReadingPagination = ({ currentPage, totalPages, onPrevPage, onNextPage }) => {
  const canGoPrev = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  return (
    <footer className="reading-pagination" aria-label="Điều hướng trang đọc">
      <button
        type="button"
        className="reading-pagination-btn"
        onClick={onPrevPage}
        disabled={!canGoPrev}
        aria-label="Trang trước"
      >
        <FaChevronCircleLeft />
      </button>

      <p className="reading-pagination-text">
        Trang {currentPage + 1} - {totalPages}
      </p>

      <button
        type="button"
        className="reading-pagination-btn"
        onClick={onNextPage}
        disabled={!canGoNext}
        aria-label="Trang sau"
      >
        <FaChevronCircleRight />
      </button>
    </footer>
  );
};

export default ReadingPagination;
