// regressionAnalyzer.js

export const REGRESSION_TYPE = {
  NONE: "NONE",
  MILD: "MILD",       // lùi 2–4 từ
  STRONG: "STRONG",   // lùi > 4 từ
  LOOP: "LOOP",       // dao động cùng vùng
  STALL: "STALL",     // không tiến sau N ms
};

const WINDOW_SIZE = 14;
const STALL_TIMEOUT_MS = 3500;
const LOOP_VARIANCE_THRESHOLD = 2.5; // std dev của wordIndex trong window
const STRONG_REGRESSION_WORDS = 4;
const MILD_REGRESSION_WORDS = 2;

/**
 * Tính standard deviation của mảng số
 */
const stdDev = (values) => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

/**
 * Phân tích window các tracking points để phát hiện regression.
 *
 * @param {Array<{wordIndex: number, timestamp: number}>} recentPoints
 * @returns {{ type: string, delta: number, confidence: number, anchorWordIndex: number|null }}
 */
export const analyzeRegression = (recentPoints) => {
  const validPoints = recentPoints
    .filter((p) => Number.isInteger(p?.wordIndex) && p.wordIndex >= 0)
    .slice(-WINDOW_SIZE);

  if (validPoints.length < 4) {
    return { type: REGRESSION_TYPE.NONE, delta: 0, confidence: 0, anchorWordIndex: null };
  }

  const indices = validPoints.map((p) => p.wordIndex);
  const timestamps = validPoints.map((p) => p.timestamp);
  const timeSpan = timestamps.at(-1) - timestamps[0];

  // --- STALL detection ---
  const maxIndex = Math.max(...indices);
  const minIndex = Math.min(...indices);
  const range = maxIndex - minIndex;
  const lastIndex = indices.at(-1);
  const firstIndex = indices[0];

  if (timeSpan > STALL_TIMEOUT_MS && range <= 1) {
    return {
      type: REGRESSION_TYPE.STALL,
      delta: 0,
      confidence: Math.min(1, timeSpan / (STALL_TIMEOUT_MS * 2)),
      anchorWordIndex: lastIndex,
    };
  }

  // --- LOOP detection: oscillating trong vùng hẹp ---
  const sd = stdDev(indices);
  const netDelta = lastIndex - firstIndex; // có thể dương (tiến) hoặc âm (lùi)

  if (sd > 0 && Math.abs(netDelta) < 3 && sd <= LOOP_VARIANCE_THRESHOLD && timeSpan > 2000) {
    return {
      type: REGRESSION_TYPE.LOOP,
      delta: netDelta,
      confidence: Math.min(1, (2000 / timeSpan) * sd),
      anchorWordIndex: Math.round(indices.reduce((a, b) => a + b, 0) / indices.length),
    };
  }

  // --- REGRESSION: net movement là lùi ---
  if (netDelta < -STRONG_REGRESSION_WORDS) {
    return {
      type: REGRESSION_TYPE.STRONG,
      delta: netDelta,
      confidence: Math.min(1, Math.abs(netDelta) / 10),
      anchorWordIndex: lastIndex,
    };
  }

  if (netDelta < -MILD_REGRESSION_WORDS) {
    return {
      type: REGRESSION_TYPE.MILD,
      delta: netDelta,
      confidence: Math.min(1, Math.abs(netDelta) / 5),
      anchorWordIndex: lastIndex,
    };
  }

  return { type: REGRESSION_TYPE.NONE, delta: netDelta, confidence: 0, anchorWordIndex: null };
};