import { REGRESSION_TYPE } from "./regressionAnalyzer";

/**
 * Map regression signal → visual intervention style
 *
 * Trả về wordIntervention object để truyền vào ReadingBookView
 */
export const resolveRegressionIntervention = ({ regressionType, wordIndex, confidence }) => {
  // Dưới ngưỡng confidence → không can thiệp
  if (confidence < 0.35) return null;

  switch (regressionType) {
    case REGRESSION_TYPE.MILD:  
      // Highlight nhẹ từ đang bị đọc lại — không làm xao nhãng
      return {
        type: "HIGHLIGHT",
        wordIndex,
        style: "mild-regression",  // CSS class
        tooltip: null,              // không show tooltip
        dimOthers: false,
      };

    case REGRESSION_TYPE.STRONG:
      // Highlight mạnh + gợi ý tooltip giải nghĩa từ đó
      return {
        type: "HIGHLIGHT_WITH_HINT",
        wordIndex,
        style: "strong-regression",
        tooltip: {
          trigger: "auto",
          anchorType: "word",
        },
        dimOthers: false,
      };

    case REGRESSION_TYPE.LOOP:
      // Trẻ bí → dim toàn bộ văn bản xung quanh, focus vào vùng loop
      return {
        type: "FOCUS_ZONE",
        wordIndex,
        style: "loop-regression",
        tooltip: {
          trigger: "auto",
          anchorType: "word",
        },
        dimOthers: true,      // dim các từ khác
        focusRadius: 3,       // highlight ±3 từ xung quanh wordIndex
      };

    case REGRESSION_TYPE.STALL:
      // Trẻ dừng lâu → show tooltip proactive, không dim
      return {
        type: "PROACTIVE_TOOLTIP",
        wordIndex,
        style: "stall-regression",
        tooltip: {
          trigger: "auto",
          anchorType: "word",
        },
        dimOthers: false,
      };

    default:
      return null;
  }
};