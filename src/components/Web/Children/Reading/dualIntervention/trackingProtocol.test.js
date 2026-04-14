import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTooltipShownEvent,
  createTrackingPoint,
  getTrackingAuthTokenContext,
} from "./trackingProtocol";

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

describe("trackingProtocol", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates mouse tracking point with both camelCase and snake_case word index", () => {
    const point = createTrackingPoint({
      x: 120,
      y: 48,
      timestamp: 123456,
      wordIndex: 9,
    });

    expect(point).toEqual({
      x: 120,
      y: 48,
      timestamp: 123456,
      wordIndex: 9,
      word_index: 9,
    });
  });

  it("acks tooltip show with both wordIndex and word_index", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T00:00:00.000Z"));

    const event = createTooltipShownEvent({
      tooltip: {
        wordIndex: 4,
        original: "con bò",
        simplified: "con bò",
      },
      cognitiveState: "REGRESSION",
    });

    expect(event).toMatchObject({
      event: "tooltip:show",
      data: {
        source: "frontend",
        wordIndex: 4,
        word_index: 4,
        original: "con bò",
        simplified: "con bò",
        cognitiveState: "REGRESSION",
      },
    });

    vi.useRealTimers();
  });

  it("prefers tracking token and validates required claims", () => {
    localStorage.setItem(
      "tracking_token",
      createJwt({
        user_id: "u-1",
        session_id: "s-1",
      }),
    );

    const tokenContext = getTrackingAuthTokenContext();
    expect(tokenContext.sourceKey).toBe("tracking_token");
    expect(tokenContext.hasRequiredClaims).toBe(true);
    expect(tokenContext.payload?.user_id).toBe("u-1");
  });

  it("marks access token without WS claims as invalid", () => {
    localStorage.setItem(
      "access_token",
      createJwt({
        sub: "u-2",
        email: "child@example.com",
      }),
    );

    const tokenContext = getTrackingAuthTokenContext();
    expect(tokenContext.sourceKey).toBe("access_token");
    expect(tokenContext.hasRequiredClaims).toBe(false);
  });
});
