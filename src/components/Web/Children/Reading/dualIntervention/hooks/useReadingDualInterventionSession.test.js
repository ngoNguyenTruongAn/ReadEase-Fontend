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

const createPointerMoveEvent = ({ wordIndex, x, y }) => ({
  pointerType: "mouse",
  clientX: x,
  clientY: y,
  target: {
    closest: (selector) => {
      if (selector !== "[data-word-index]") return null;
      return {
        getAttribute: () => String(wordIndex),
      };
    },
  },
});

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
      ws.emitMessage({
        event: "adaptation:trigger",
        data: {
          state: "REGRESSION",
          type: "VISUAL",
          mode: "DUAL_INTERVENTION",
          confidence: 0.91,
          wordIndex: 3,
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
    expect(result.current.activeTooltip?.visible).toBe(true);

    act(() => {
      result.current.handleTooltipRendered(result.current.activeTooltip);
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.trackingDebug.outbound.tooltipShow).toBe(1);

    const tooltipAckFrameRaw = ws.sentFrames.find((frame) => {
      const parsed = JSON.parse(frame);
      return parsed.event === "tooltip:show" && parsed.data.source === "frontend";
    });
    const tooltipAckFrame = JSON.parse(tooltipAckFrameRaw);
    expect(tooltipAckFrame.data.wordIndex).toBe(3);
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

  it("applies local deep inverted fallback when WS is blocked by invalid token claims", async () => {
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
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 8, x: 290, y: 154 }));
      result.current.handleStoryPointerMove(createPointerMoveEvent({ wordIndex: 5, x: 266, y: 158 }));
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.visualFlags.isVisualActive).toBe(true);
    expect(result.current.visualFlags.isInvertedDeep).toBe(true);
    expect(result.current.visualFlags.mode).toBe("DUAL_INTERVENTION");
    expect(result.current.wordIntervention.regressionWordIndex).toBe(5);
    expect(result.current.trackingDebug.localFallbackInterventions).toBeGreaterThan(0);
    expect(result.current.trackingDebug.localFallbackActive).toBe(true);
  });
});
