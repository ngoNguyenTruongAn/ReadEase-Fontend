const STORY_STORAGE_KEY = "children:selected-story";
const STORY_EMPTY_PLACEHOLDER = "Nội dung truyện sẽ sớm được cập nhật.";

export const STORY_CONTENT_UNAVAILABLE_MESSAGE =
  "Nội dung truyện hiện không khả dụng. Vui lòng thử lại sau.";

export const saveSelectedStory = (story) => {
  if (!story) return;

  try {
    sessionStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(story));
  } catch (error) {
    console.error("Unable to persist selected story:", error);
  }
};

export const getSelectedStory = () => {
  try {
    const raw = sessionStorage.getItem(STORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Unable to read selected story:", error);
    return null;
  }
};

const toStringSafe = (value) => String(value ?? "").trim();

/**
 * Split a paragraph into sentence-boundary-respecting chunks that fit within
 * maxCharsPerPage.
 *
 * Strategy:
 *   1. Split the paragraph into sentences using Vietnamese-aware sentence
 *      terminators (. ! ? … :) followed by a space or end-of-string.
 *   2. Greedily pack sentences into chunks.
 *   3. Only fall back to word-level splitting when a single sentence is itself
 *      longer than maxCharsPerPage (extremely rare in children's stories).
 */
const splitParagraphIntoChunks = (paragraph, maxCharsPerPage) => {
  // Split on sentence-ending punctuation followed by whitespace or EOS,
  // keeping the terminator attached to the preceding sentence.
  const sentencePattern = /(?<=[.!?…:])(?=\s+\S|\s*$)/g;
  const rawSentences = paragraph
    .split(sentencePattern)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const sentence of rawSentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length <= maxCharsPerPage) {
      current = candidate;
      continue;
    }

    // Flush current chunk before starting a new one.
    if (current) {
      chunks.push(current);
      current = "";
    }

    // The sentence fits on its own — start a new chunk with it.
    if (sentence.length <= maxCharsPerPage) {
      current = sentence;
      continue;
    }

    // Sentence is longer than a full page — fall back to word-level splitting.
    const words = sentence.split(/\s+/);
    let wordChunk = "";

    for (const word of words) {
      const wordCandidate = wordChunk ? `${wordChunk} ${word}` : word;
      if (wordCandidate.length <= maxCharsPerPage) {
        wordChunk = wordCandidate;
      } else {
        if (wordChunk) chunks.push(wordChunk);
        wordChunk = word;
      }
    }

    if (wordChunk) current = wordChunk;
  }

  if (current) chunks.push(current);

  return chunks;
};

export const splitIntoPages = (rawText, maxCharsPerPage = 420) => {
  const normalized = toStringSafe(rawText).replace(/\r/g, "").trim();
  if (!normalized) {
    return [STORY_EMPTY_PLACEHOLDER];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [STORY_EMPTY_PLACEHOLDER];
  }

  const pages = [];
  let currentPage = "";

  for (const paragraph of paragraphs) {
    // Try to append the whole paragraph to the current page first.
    const nextBlock = currentPage ? `${currentPage}\n\n${paragraph}` : paragraph;

    if (nextBlock.length <= maxCharsPerPage) {
      currentPage = nextBlock;
      continue;
    }

    // The paragraph doesn't fit as a whole — flush the current page and then
    // try to add just this paragraph.
    if (currentPage) {
      pages.push(currentPage);
      currentPage = "";
    }

    if (paragraph.length <= maxCharsPerPage) {
      currentPage = paragraph;
      continue;
    }

    // Paragraph is too long for one page — split it at sentence boundaries.
    const chunks = splitParagraphIntoChunks(paragraph, maxCharsPerPage);

    for (let i = 0; i < chunks.length - 1; i++) {
      pages.push(chunks[i]);
    }
    // Hold the last chunk so subsequent paragraphs can be appended to it.
    currentPage = chunks[chunks.length - 1] ?? "";
  }

  if (currentPage) pages.push(currentPage);

  return pages.length > 0 ? pages : [STORY_EMPTY_PLACEHOLDER];
};

const normalizePageItem = (item) => {
  if (!item) return "";
  if (typeof item === "string") return item;
  return (
    toStringSafe(item.content) ||
    toStringSafe(item.text) ||
    toStringSafe(item.pageContent)
  );
};

const resolveStoryBody = (story, selectedStory) =>
  story?.body ??
  story?.content ??
  story?.story ??
  selectedStory?.body ??
  selectedStory?.content ??
  selectedStory?.description ??
  "";

const resolveStorySegmentedBody = (story, selectedStory) =>
  story?.body_segmented ??
  story?.bodySegmented ??
  story?.segmented_body ??
  story?.segmentedBody ??
  selectedStory?.body_segmented ??
  selectedStory?.bodySegmented ??
  null;

export const extractStoryId = (story) =>
  story?.id ??
  story?._id ??
  story?.storyId ??
  story?.story_id ??
  story?.contentId ??
  story?.content_id ??
  story?.contentID ??
  story?.uuid ??
  null;

export const pickStoryFromCollection = (stories, selectedStory) => {
  if (!Array.isArray(stories) || stories.length === 0) return null;
  if (!selectedStory) return stories[0];

  const selectedId = extractStoryId(selectedStory);
  if (selectedId !== null && selectedId !== undefined) {
    const byId = stories.find((item) => String(extractStoryId(item)) === String(selectedId));
    if (byId) return byId;
  }

  const selectedTitle = toStringSafe(selectedStory.title).toLowerCase();
  if (selectedTitle) {
    const byTitle = stories.find(
      (item) => toStringSafe(item.title).toLowerCase() === selectedTitle,
    );
    if (byTitle) return byTitle;
  }

  return stories[0];
};

export const normalizeStoryPayload = (story, selectedStory) => {
  const title =
    toStringSafe(story?.title) ||
    toStringSafe(selectedStory?.title) ||
    "Truyện đang mở";
  const contentId = extractStoryId(story) ?? extractStoryId(selectedStory);

  const content = resolveStoryBody(story, selectedStory);
  const segmentedContent = resolveStorySegmentedBody(story, selectedStory);

  if (Array.isArray(content)) {
    const pages = content.map(normalizePageItem).filter(Boolean);
    if (pages.length > 0) {
      const segmentedPages = Array.isArray(segmentedContent)
        ? segmentedContent.map(normalizePageItem).filter(Boolean)
        : pages;

      return {
        title,
        contentId,
        pages,
        segmentedPages,
        rawBodyText: pages.join("\n\n"),
        rawSegmentedBodyText: segmentedPages.join("\n\n"),
        isContentAvailable: true,
      };
    }
  }

  const fallbackRawBody = toStringSafe(content);
  const fallbackSegmentedBody = toStringSafe(segmentedContent) || fallbackRawBody;

  const pages = splitIntoPages(fallbackRawBody || selectedStory?.description);
  const segmentedPages = splitIntoPages(fallbackSegmentedBody || selectedStory?.description);

  return {
    title,
    contentId,
    pages,
    segmentedPages,
    rawBodyText: fallbackRawBody || pages.join("\n\n"),
    rawSegmentedBodyText: fallbackSegmentedBody || segmentedPages.join("\n\n"),
    isContentAvailable: Boolean(fallbackRawBody || fallbackSegmentedBody),
  };
};

export const buildUnavailableStoryPayload = (story, selectedStory) => ({
  title:
    toStringSafe(story?.title) ||
    toStringSafe(selectedStory?.title) ||
    "Truyện đang mở",
  contentId: extractStoryId(story) ?? extractStoryId(selectedStory),
  pages: [""],
  segmentedPages: [""],
  rawBodyText: "",
  rawSegmentedBodyText: "",
  isContentAvailable: false,
});

export const STORY_FALLBACK = {
  title: "Cây khế trả vàng",
  contentId: null,
  pages: [
    "Năm ấy, cây khế trong vườn nhà người em bỗng sai quả lạ thường, cành nào cũng trĩu quả ngọt, vàng ruộm. Người em nhìn cây khế mà lòng khấp khởi mừng thầm tính chuyện bán khế lấy tiền dong gạo.",
    "Bỗng một hôm, có con chim lớn bay tới ăn khế. Người em buồn rầu khóc kể gia cảnh khó khăn. Chim bèn nói: Ăn một quả trả cục vàng, may túi ba gang mang đi mà đựng.",
    "Người em làm theo lời chim dặn, được chim chở ra đảo vàng lấy đủ ba gang túi rồi trở về. Từ đó, gia đình người em no đủ và sống hiền lành, chăm chỉ như trước.",
  ],
  segmentedPages: [
    "Năm ấy, cây khế trong vườn nhà người em bỗng sai quả lạ thường, cành nào cũng trĩu quả ngọt, vàng ruộm. Người em nhìn cây khế mà lòng khấp khởi mừng thầm tính chuyện bán khế lấy tiền dong gạo.",
    "Bỗng một hôm, có con chim lớn bay tới ăn khế. Người em buồn rầu khóc kể gia cảnh khó khăn. Chim bèn nói: Ăn một quả trả cục vàng, may túi ba gang mang đi mà đựng.",
    "Người em làm theo lời chim dặn, được chim chở ra đảo vàng lấy đủ ba gang túi rồi trở về. Từ đó, gia đình người em no đủ và sống hiền lành, chăm chỉ như trước.",
  ],
  rawBodyText:
    "Năm ấy, cây khế trong vườn nhà người em bỗng sai quả lạ thường, cành nào cũng trĩu quả ngọt, vàng ruộm. Người em nhìn cây khế mà lòng khấp khởi mừng thầm tính chuyện bán khế lấy tiền dong gạo.\n\nBỗng một hôm, có con chim lớn bay tới ăn khế. Người em buồn rầu khóc kể gia cảnh khó khăn. Chim bèn nói: Ăn một quả trả cục vàng, may túi ba gang mang đi mà đựng.\n\nNgười em làm theo lời chim dặn, được chim chở ra đảo vàng lấy đủ ba gang túi rồi trở về. Từ đó, gia đình người em no đủ và sống hiền lành, chăm chỉ như trước.",
  rawSegmentedBodyText:
    "Năm ấy, cây khế trong vườn nhà người em bỗng sai quả lạ thường, cành nào cũng trĩu quả ngọt, vàng ruộm. Người em nhìn cây khế mà lòng khấp khởi mừng thầm tính chuyện bán khế lấy tiền dong gạo.\n\nBỗng một hôm, có con chim lớn bay tới ăn khế. Người em buồn rầu khóc kể gia cảnh khó khăn. Chim bèn nói: Ăn một quả trả cục vàng, may túi ba gang mang đi mà đựng.\n\nNgười em làm theo lời chim dặn, được chim chở ra đảo vàng lấy đủ ba gang túi rồi trở về. Từ đó, gia đình người em no đủ và sống hiền lành, chăm chỉ như trước.",
};