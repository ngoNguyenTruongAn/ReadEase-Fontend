import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useReadingDualInterventionSession from "./useReadingDualInterventionSession";

class MockWebSocket {
  static instances = [];

  static CONNECTING = 0;

  static OPEN = 1;

  static CLOSING = 2;

  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sentFrames = [];
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;

    MockWebSocket.instances.push(this);
  }

  send(payload) {
    this.sentFrames.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "closed" });
  }

  emitClose(payload = { code: 1005, reason: "" }) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(payload);
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

const createRect = ({ top, left, width = 40, height = 20 }) => ({
  top,
  left,
  right: Number.isFinite(left) ? left + width : undefined,
  bottom: Number.isFinite(top) ? top + height : undefined,
  width,
  height,
});

const createPointerMoveEvent = ({
  wordIndex,
  x,
  y,
  top,
  left,
  width = 40,
  height = 20,
  wordLayouts = {},
}) => {
  const layoutsByWordIndex = new Map(
    Object.entries({
      ...wordLayouts,
      [wordIndex]: { top, left, width, height },
    }).map(([index, layout]) => [Number(index), layout]),
  );

  let rootElement;
  const createWordElement = (index) => ({
    getAttribute: () => String(index),
    getBoundingClientRect: () => createRect(layoutsByWordIndex.get(index)),
    closest: (selector) => (selector === ".reading-book-view" ? rootElement : null),
    parentElement: rootElement,
  });

  rootElement = {
    querySelector: (selector) => {
      const match = /\.reading-word\[data-word-index="(-?\d+)"\]/.exec(selector);
      if (!match) return null;
      const index = Number(match[1]);
      return layoutsByWordIndex.has(index) ? createWordElement(index) : null;
    },
  };

  const currentWordElement = createWordElement(wordIndex);

  return {
    pointerType: "mouse",
    clientX: x,
    clientY: y,
    target: {
      closest: (selector) => {
        if (selector !== "[data-word-index]") return null;
        return currentWordElement;
      },
    },
  };
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const toBase64Url = (value) => {
  const utf8 = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)),
  );

  return btoa(utf8)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const createJwt = (payload) => {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  return `${header}.${body}.signature`;
};

describe("useReadingDualInterventionSession scenarios", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    MockWebSocket.instances = [];
    globalThis.WebSocket = originalWebSocket;
  });

  it("Scenario A (reload without token) blocks WS session and reports debug status", async () => {
    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-1",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.wsStatus).toBe("blocked:no-token");
    expect(result.current.trackingDebug.authTokenReady).toBe(false);
    expect(result.current.trackingDebug.outbound.sessionStart).toBe(0);
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("Scenario B (normal flow with token) opens WS and sends tracking frames", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-1",
        session_id: "session-1",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-2",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => ({
          original: "con bo",
          simplified: "con bo",
        }),
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toContain("/tracking");
    expect(ws.url).toContain("token=");

    act(() => {
      ws.emitOpen();
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.wsStatus).toBe("open");
    expect(result.current.trackingDebug.outbound.sessionStart).toBe(1);
    expect(result.current.trackingDebug.sessionId).toBeTruthy();

    const sessionStartFrame = JSON.parse(ws.sentFrames[0]);
    expect(sessionStartFrame.event).toBe("session:start");

    act(() => {
      for (let i = 0; i < 6; i += 1) {
        result.current.handleStoryPointerMove(
          createPointerMoveEvent({ wordIndex: 3, x: 120 + i * 2, y: 80 + i * 2 }),
        );
      }
      vi.advanceTimersByTime(140);
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.outbound.mouseBatch).toBeGreaterThan(0);

    const mouseBatchFrameRaw = ws.sentFrames.find((frame) => {
      const parsed = JSON.parse(frame);
      return parsed.event === "mouse:batch";
    });
    const mouseBatchFrame = JSON.parse(mouseBatchFrameRaw);

    expect(mouseBatchFrame.data.points.length).toBeGreaterThanOrEqual(1);

    act(() => {
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 12, x: 314, y: 152 }));
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 8, x: 290, y: 154 }));
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 5, x: 266, y: 158 }));
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 4, x: 254, y: 160 }));
    });

    act(() => {
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          type: "VISUAL",
          mode: "DUAL_INTERVENTION",
          confidence: 0.91,
          wordIndex: 4,
          params: {
            letterSpacing: 0.08,
          },
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.inbound.adaptation).toBe(1);
    expect(result.current.visualFlags.isVisualActive).toBe(true);

    act(() => {
      ws.emitMessage({
        event: "tooltip:show",
        data: {
          requestId: "tip-1",
          wordIndex: 3,
          original: "con bo",
          simplified: "con bo",
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.inbound.tooltip).toBe(1);
    expect(result.current.trackingDebug.lastInboundEvent).toBe("adaptation:trigger");
    expect(result.current.activeTooltip).toBeNull();
    expect(result.current.wordIntervention.regressionWordIndex).toBe(4);

    act(() => {
      result.current.handleTooltipRendered({
        id: "tip-1",
        visible: true,
        wordIndex: 3,
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.outbound.tooltipShow).toBe(0);

    const tooltipAckFrameRaw = ws.sentFrames.find((frame) => {
      const parsed = JSON.parse(frame);
      return parsed.event === "tooltip:show" && parsed.data.source === "frontend";
    });
    expect(tooltipAckFrameRaw).toBeUndefined();
  });

  it("streams synthetic mouse samples while cursor is stationary on a word", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-stationary",
        session_id: "session-stationary",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-stationary",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
    });

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 9, x: 210, y: 144 }),
      );
      vi.advanceTimersByTime(560);
    });

    await act(async () => {
      await flushMicrotasks();
    });

    const mouseBatchFrames = ws.sentFrames
      .map((frame) => JSON.parse(frame))
      .filter((frame) => frame.event === "mouse:batch");

    expect(mouseBatchFrames.length).toBeGreaterThan(0);
    expect(result.current.trackingDebug.outbound.mouseBatch).toBeGreaterThan(0);

    const stationaryPoints = mouseBatchFrames.flatMap((frame) =>
      frame.data.points.filter((point) => point.wordIndex === 9 && point.x === 210 && point.y === 144),
    );

    expect(stationaryPoints.length).toBeGreaterThanOrEqual(4);
    expect(
      stationaryPoints.every(
        (point) => point.wordIndex === 9 && point.word_index === 9,
      ),
    ).toBe(true);
  });

  it("reconnects after abnormal close and resumes mouse batching", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-2",
        session_id: "session-2",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-3",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws1 = MockWebSocket.instances[0];
    act(() => {
      ws1.emitOpen();
    });

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      ws1.emitClose({ code: 1005, reason: "" });
      vi.advanceTimersByTime(1200);
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.wsStatus).toBe("connecting");
    expect(result.current.trackingDebug.reconnectAttempts).toBe(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    const ws2 = MockWebSocket.instances[1];
    act(() => {
      ws2.emitOpen();
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.wsStatus).toBe("open");
    expect(result.current.trackingDebug.outbound.sessionStart).toBe(2);

    act(() => {
      for (let i = 0; i < 8; i += 1) {
        result.current.handleStoryPointerMove(
          createPointerMoveEvent({ wordIndex: 2, x: 180 + i, y: 120 + i }),
        );
      }
      vi.advanceTimersByTime(160);
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.outbound.mouseBatch).toBeGreaterThan(0);
    expect(result.current.trackingDebug.totalPointsSent).toBeGreaterThan(0);
  });

  it("blocks WS when token exists but misses required claims", async () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "user-3",
        role: "ROLE_CHILD",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-4",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.wsStatus).toBe("blocked:invalid-token-claims");
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("applies backend regression adaptation immediately", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-4",
        session_id: "session-4",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-5",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitOpen();
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          type: "VISUAL",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 8,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.inbound.adaptation).toBe(1);
    expect(result.current.visualFlags.isVisualActive).toBe(true);

    act(() => {
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 12, x: 314, y: 152 }));
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 8, x: 290, y: 154 }));
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 5, x: 266, y: 158 }));
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 4, x: 254, y: 160 }));
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(true);
    expect(result.current.wordIntervention.regressionWordIndex).toBe(8);
  });

  it("waits for sustained regression before applying local fallback", async () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "user-4",
        role: "ROLE_CHILD",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-5",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.wsStatus).toBe("blocked:invalid-token-claims");

    act(() => {
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 12, x: 314, y: 152 }));
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 8, x: 290, y: 154 }));
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 5, x: 266, y: 158 }));
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(false);
    expect(result.current.trackingDebug.localFallbackInterventions).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 4, x: 254, y: 160 }));
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(true);
    expect(result.current.visualFlags.isInvertedDeep).toBe(true);
    expect(result.current.visualFlags.mode).toBe("DUAL_INTERVENTION");
    expect(result.current.wordIntervention.regressionWordIndex).toBe(4);
    expect(result.current.trackingDebug.localFallbackInterventions).toBeGreaterThan(0);
    expect(result.current.trackingDebug.localFallbackActive).toBe(true);
  });

  it("ignores line-wrap overshoot settling before applying local regression", async () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "user-line-wrap",
        role: "ROLE_CHILD",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-line-wrap",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 21, x: 500, y: 100, top: 100, left: 500 }),
      );
      vi.advanceTimersByTime(300);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 25, x: 160, y: 132, top: 132, left: 160 }),
      );
      vi.advanceTimersByTime(800);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 24, x: 130, y: 132, top: 132, left: 130 }),
      );
      vi.advanceTimersByTime(800);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 23, x: 100, y: 132, top: 132, left: 100 }),
      );
      vi.advanceTimersByTime(800);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 22, x: 70, y: 132, top: 132, left: 70 }),
      );
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(false);
    expect(result.current.trackingDebug.localFallbackInterventions).toBe(0);
  });

  it("ignores same-line down-left sweep before local regression fallback", async () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "user-line-end-sweep",
        role: "ROLE_CHILD",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-line-end-sweep",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 21, x: 535, y: 110, top: 100, left: 500 }),
      );
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 20, x: 500, y: 116, top: 100, left: 460 }),
      );
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 19, x: 460, y: 118, top: 100, left: 420 }),
      );
      vi.advanceTimersByTime(1100);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 18, x: 420, y: 119, top: 100, left: 380 }),
      );
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(false);
    expect(result.current.trackingDebug.localFallbackInterventions).toBe(0);
  });

  it("retargets backend interventions to a new word without waiting for the old style timeout", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-retarget",
        session_id: "session-retarget",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-retarget",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 5,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(5);

    act(() => {
      vi.advanceTimersByTime(300);
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.92,
          wordIndex: 8,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(8);
    expect(result.current.visualFlags.isVisualActive).toBe(true);
  });

  it("resets page-scoped intervention and ignores stale backend events after page change", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-page-change",
        session_id: "session-page-change",
      }),
    );

    const { result, rerender } = renderHook(
      ({ pageKey }) =>
        useReadingDualInterventionSession({
          enabled: true,
          contentId: "story-page-change",
          apiBaseUrl: "http://localhost:3000/api/v1/",
          pageKey,
        }),
      {
        initialProps: { pageKey: "page-1" },
      },
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 18, x: 420, y: 520 }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 18,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(18);

    act(() => {
      rerender({ pageKey: "page-2" });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(false);
    expect(result.current.wordIntervention.regressionWordIndex).toBe(null);

    act(() => {
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 18,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(null);

    act(() => {
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 2, x: 160, y: 120 }),
      );
      vi.advanceTimersByTime(900);
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.91,
          wordIndex: 18,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(null);

    act(() => {
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.91,
          wordIndex: 2,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(2);
  });

  it("holds backend regression retarget only while cursor is settling across a line wrap", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-line-wrap-backend",
        session_id: "session-line-wrap-backend",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-line-wrap-backend",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 10, x: 500, y: 100, top: 100, left: 500 }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 10,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(10);

    act(() => {
      vi.advanceTimersByTime(300);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 13, x: 180, y: 134, top: 134, left: 180 }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 13,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(10);

    act(() => {
      vi.advanceTimersByTime(2300);
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 13,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(13);

    act(() => {
      vi.advanceTimersByTime(4000);
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 13,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(13);
  });

  it("ignores backend regression while cursor is sweeping down-left across a line end", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-line-end-backend",
        session_id: "session-line-end-backend",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-line-end-backend",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 21, x: 535, y: 110, top: 100, left: 500 }),
      );
      vi.advanceTimersByTime(300);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 20, x: 500, y: 116, top: 100, left: 460 }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 20,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(null);

    act(() => {
      vi.advanceTimersByTime(2300);
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 20,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(20);
  });

  it("ignores backend regression on the old line-end word while cursor descends", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-line-end-anchor",
        session_id: "session-line-end-anchor",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-line-end-anchor",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({
          wordIndex: 21,
          x: 526,
          y: 110,
          top: 100,
          left: 500,
          wordLayouts: {
            22: { top: 132, left: 160 },
          },
        }),
      );
      vi.advanceTimersByTime(300);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({
          wordIndex: 21,
          x: 528,
          y: 116,
          top: 100,
          left: 500,
          wordLayouts: {
            22: { top: 132, left: 160 },
          },
        }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 21,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(null);

    act(() => {
      vi.advanceTimersByTime(2300);
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 21,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(21);
  });

  it("arms the line-end guard as soon as cursor reaches the old line-end word", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-line-end-enter",
        session_id: "session-line-end-enter",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-line-end-enter",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 20, x: 490, y: 110, top: 100, left: 460 }),
      );
      vi.advanceTimersByTime(120);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({
          wordIndex: 21,
          x: 526,
          y: 116,
          top: 100,
          left: 500,
          wordLayouts: {
            22: { top: 132, left: 160 },
          },
        }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 21,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(null);
  });

  it("keeps a lower-line end-word touch from retargeting regression during zigzag", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-next-line-end-zigzag",
        session_id: "session-next-line-end-zigzag",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-next-line-end-zigzag",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({
          wordIndex: 21,
          x: 510,
          y: 104,
          top: 100,
          left: 500,
          wordLayouts: {
            22: { top: 132, left: 160 },
          },
        }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.9,
          wordIndex: 21,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(21);

    act(() => {
      vi.advanceTimersByTime(300);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({
          wordIndex: 35,
          x: 510,
          y: 138,
          top: 132,
          left: 500,
          wordLayouts: {
            34: { top: 132, left: 460 },
            36: { top: 164, left: 160 },
          },
        }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          mode: "DUAL_INTERVENTION",
          confidence: 0.92,
          wordIndex: 35,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.regressionWordIndex).toBe(21);
  });

  it("classifies local oscillation fallback as LOOP", async () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "user-loop",
        role: "ROLE_CHILD",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-loop",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 10, x: 200, y: 120 }));
      vi.advanceTimersByTime(700);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 11, x: 230, y: 120 }));
      vi.advanceTimersByTime(700);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 10, x: 200, y: 120 }));
      vi.advanceTimersByTime(700);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 11, x: 230, y: 120 }));
      vi.advanceTimersByTime(700);
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 10, x: 200, y: 120 }));
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(true);
    expect(result.current.wordIntervention.regressionWordIndex).toBe(10);
    expect(result.current.wordIntervention.regressionType).toBe("LOOP");
    expect(result.current.wordIntervention.regressionFocusRadius).toBe(3);
  });

  it("maps same-word dwell fallback to regression stall instead of distraction", async () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "user-5",
        role: "ROLE_CHILD",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-6",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 7, x: 200, y: 120 }));
      vi.advanceTimersByTime(4000);
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(false);
    expect(result.current.trackingDebug.localFallbackInterventions).toBe(0);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(true);
    expect(result.current.visualFlags.mode).toBe("DUAL_INTERVENTION");
    expect(result.current.wordIntervention.distractionWordIndex).toBe(null);
    expect(result.current.wordIntervention.regressionWordIndex).toBe(7);
    expect(result.current.wordIntervention.regressionType).toBe("STALL");
    expect(result.current.trackingDebug.localFallbackReason).toBe("local-dwell-stall");
  });

  it("does not treat slow in-word cursor progress as local dwell", async () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "user-slow-word-progress",
        role: "ROLE_CHILD",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-slow-word-progress",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      for (let step = 0; step < 8; step += 1) {
        result.current.handleStoryPointerMove(
          createPointerMoveEvent({
            wordIndex: 7,
            x: 200 + step,
            y: 120,
            top: 110,
            left: 180,
            width: 120,
          }),
        );
        vi.advanceTimersByTime(700);
      }
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(false);
    expect(result.current.wordIntervention.distractionWordIndex).toBe(null);
    expect(result.current.trackingDebug.localFallbackInterventions).toBe(0);
  });

  it("classifies fast erratic scanning as local distraction fallback", async () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "user-erratic",
        role: "ROLE_CHILD",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-erratic",
        apiBaseUrl: "http://localhost:3000/api/v1/",
        resolveTooltipByWordIndex: () => null,
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const points = [
      { wordIndex: 3, x: 100, y: 100 },
      { wordIndex: 8, x: 260, y: 100 },
      { wordIndex: 14, x: 110, y: 250 },
      { wordIndex: 20, x: 280, y: 250 },
      { wordIndex: 26, x: 120, y: 110 },
      { wordIndex: 32, x: 300, y: 290 },
      { wordIndex: 38, x: 130, y: 280 },
      { wordIndex: 44, x: 310, y: 120 },
    ];

    act(() => {
      points.forEach((point) => {
        result.current.handleStoryPointerMove(createPointerMoveEvent(point));
        vi.advanceTimersByTime(120);
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(true);
    expect(result.current.visualFlags.mode).toBe("VISUAL_ONLY");
    expect(result.current.wordIntervention.distractionWordIndex).toBe(44);
    expect(result.current.wordIntervention.regressionWordIndex).toBe(null);
    expect(result.current.trackingDebug.localFallbackReason).toBe("local-erratic-movement");
    expect(result.current.trackingDebug.localFallbackInterventions).toBe(1);

    act(() => {
      points.forEach((point) => {
        result.current.handleStoryPointerMove(createPointerMoveEvent(point));
        vi.advanceTimersByTime(120);
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.localFallbackInterventions).toBe(1);
  });

  it("applies backend distraction immediately while cursor is still progressing inside a long word", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-backend-slow-word-progress",
        session_id: "session-backend-slow-word-progress",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-backend-slow-word-progress",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({
          wordIndex: 7,
          x: 200,
          y: 120,
          top: 110,
          left: 180,
          width: 120,
        }),
      );
      vi.advanceTimersByTime(700);
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({
          wordIndex: 7,
          x: 201,
          y: 120,
          top: 110,
          left: 180,
          width: 120,
        }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "DISTRACTION",
          mode: "VISUAL_ONLY",
          confidence: 0.86,
          wordIndex: 7,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(true);
    expect(result.current.visualFlags.mode).toBe("VISUAL_ONLY");
    expect(result.current.wordIntervention.distractionWordIndex).toBe(7);
    expect(result.current.wordIntervention.regressionWordIndex).toBe(null);
  });

  it("applies backend distraction without requiring stationary dwell", async () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "user-backend-stationary-dwell",
        session_id: "session-backend-stationary-dwell",
      }),
    );

    const { result } = renderHook(() =>
      useReadingDualInterventionSession({
        enabled: true,
        contentId: "story-backend-stationary-dwell",
        apiBaseUrl: "http://localhost:3000/api/v1/",
      }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.emitOpen();
      result.current.handleStoryPointerMove(
        createPointerMoveEvent({ wordIndex: 7, x: 200, y: 120 }),
      );
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "DISTRACTION",
          mode: "VISUAL_ONLY",
          confidence: 0.86,
          wordIndex: 7,
        },
      });
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.wordIntervention.distractionWordIndex).toBe(7);
  });
});
