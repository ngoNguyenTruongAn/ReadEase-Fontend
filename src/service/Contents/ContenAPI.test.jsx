import { beforeEach, describe, expect, it, vi } from "vitest";
import ContenAPI from "./ContenAPI";
import instance from "../instance";

vi.mock("../instance", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockFetchResponse = (text, ok = true, status = 200) => ({
  ok,
  status,
  text: vi.fn().mockResolvedValue(text),
});

describe("ContenAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    if (typeof window !== "undefined") {
      window.sessionStorage.clear();
    }
  });

  it("reads detail payload from success.data", async () => {
    instance.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: "story-1", title: "Demo" },
      },
    });

    const result = await ContenAPI.getReadingStoryDetail("story-1");

    expect(instance.get).toHaveBeenCalledWith("content/story-1");
    expect(result).toEqual({ id: "story-1", title: "Demo" });
  });

  it("prioritizes body_segmented_url and still fetches body_url when available", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(mockFetchResponse("segmented one"))
      .mockResolvedValueOnce(mockFetchResponse("raw body one"));

    const result = await ContenAPI.resolveReadingStoryContent({
      body_segmented_url: "https://cdn.example.com/story-segmented.txt",
      body_url: "https://cdn.example.com/story-body.txt",
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "https://cdn.example.com/story-segmented.txt", {
      method: "GET",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, "https://cdn.example.com/story-body.txt", {
      method: "GET",
    });
    expect(result).toMatchObject({
      isAvailable: true,
      source: "body_segmented_url",
      segmentedText: "segmented one",
      bodyText: "raw body one",
    });
  });

  it("falls back to body_url when body_segmented_url is empty", async () => {
    globalThis.fetch.mockResolvedValueOnce(mockFetchResponse("raw only"));

    const result = await ContenAPI.resolveReadingStoryContent({
      body_segmented_url: "",
      body_url: "https://cdn.example.com/story-body.txt",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      isAvailable: true,
      source: "body_url",
      bodyText: "raw only",
      segmentedText: "raw only",
    });
  });

  it("returns unavailable state when both content URLs are missing", async () => {
    const result = await ContenAPI.resolveReadingStoryContent({
      body_segmented_url: null,
      body_url: "",
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      isAvailable: false,
      errorCode: "CONTENT_URL_MISSING",
    });
  });

  it("uses inline legacy body fields when detail includes direct text", async () => {
    const result = await ContenAPI.resolveReadingStoryContent({
      body: "day la noi dung tho",
      body_segmented: "day_la noi_dung tho",
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      isAvailable: true,
      source: "inline_body",
      bodyText: "day la noi dung tho",
      segmentedText: "day_la noi_dung tho",
    });
  });

  it("temporarily disables detail endpoint after 500 and short-circuits next call", async () => {
    instance.get.mockRejectedValueOnce({
      response: {
        status: 500,
        data: {
          success: false,
          error: {
            message: "column ReadingContent.body_url does not exist",
          },
        },
      },
      message: "Request failed with status code 500",
    });

    await expect(ContenAPI.getReadingStoryDetail("story-1")).rejects.toMatchObject({
      code: "CONTENT_DETAIL_ENDPOINT_TEMPORARILY_DISABLED",
    });

    await expect(ContenAPI.getReadingStoryDetail("story-1")).rejects.toMatchObject({
      code: "CONTENT_DETAIL_ENDPOINT_TEMPORARILY_DISABLED",
    });

    expect(instance.get).toHaveBeenCalledTimes(1);
  });

  it("validates minimum body length on create", async () => {
    await expect(
      ContenAPI.createContent({
        title: "Truyen thu",
        body: "qua ngan",
        difficulty: "EASY",
        age_group: "7-9",
      }),
    ).rejects.toMatchObject({ message: "Body must be at least 50 characters." });

    expect(instance.post).not.toHaveBeenCalled();
  });

  it("maps create payload to backend DTO fields", async () => {
    const longBody = "a".repeat(60);

    instance.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: "story-2" },
      },
    });

    const result = await ContenAPI.createContent({
      title: "Truyen moi",
      body: longBody,
      difficulty: "medium",
      ageGroup: "7-9",
      coverImageUrl: "https://cdn.example.com/cover.png",
    });

    expect(instance.post).toHaveBeenCalledWith("content", {
      title: "Truyen moi",
      body: longBody,
      difficulty: "MEDIUM",
      age_group: "7-9",
      cover_image_url: "https://cdn.example.com/cover.png",
    });
    expect(result).toEqual({ id: "story-2" });
  });
});