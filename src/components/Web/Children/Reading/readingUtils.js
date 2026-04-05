const STORY_STORAGE_KEY = "children:selected-story";

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

const splitIntoPages = (rawText, maxCharsPerPage = 420) => {
  const normalized = toStringSafe(rawText).replace(/\r/g, "").trim();
  if (!normalized) {
    return ["Nội dung truyện sẽ sớm được cập nhật."];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return ["Nội dung truyện sẽ sớm được cập nhật."];
  }

  const pages = [];
  let currentPage = "";

  paragraphs.forEach((paragraph) => {
    const nextBlock = currentPage
      ? `${currentPage}\n\n${paragraph}`
      : paragraph;

    if (nextBlock.length <= maxCharsPerPage) {
      currentPage = nextBlock;
      return;
    }

    if (currentPage) {
      pages.push(currentPage);
      currentPage = "";
    }

    if (paragraph.length <= maxCharsPerPage) {
      currentPage = paragraph;
      return;
    }

    const words = paragraph.split(/\s+/);
    let chunk = "";

    words.forEach((word) => {
      const candidate = chunk ? `${chunk} ${word}` : word;
      if (candidate.length <= maxCharsPerPage) {
        chunk = candidate;
      } else {
        if (chunk) pages.push(chunk);
        chunk = word;
      }
    });

    if (chunk) {
      currentPage = chunk;
    }
  });

  if (currentPage) pages.push(currentPage);

  return pages.length > 0 ? pages : ["Nội dung truyện sẽ sớm được cập nhật."];
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

const extractStoryId = (story) => story?.id ?? story?._id ?? story?.storyId ?? null;

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

  const content = story?.content ?? story?.story ?? story?.body ?? null;

  if (Array.isArray(content)) {
    const pages = content.map(normalizePageItem).filter(Boolean);
    if (pages.length > 0) {
      return { title, pages };
    }
  }

  return {
    title,
    pages: splitIntoPages(content || selectedStory?.content || selectedStory?.description),
  };
};

export const STORY_FALLBACK = {
  title: "Cây khế trả vàng",
  pages: [
    "Năm ấy, cây khế trong vườn nhà người em bỗng sai quả lạ thường, cành nào cũng trĩu quả ngọt, vàng ruộm. Người em nhìn cây khế mà lòng khấp khởi mừng thầm tính chuyện bán khế lấy tiền dong gạo.",
    "Bỗng một hôm, có con chim lớn bay tới ăn khế. Người em buồn rầu khóc kể gia cảnh khó khăn. Chim bèn nói: Ăn một quả trả cục vàng, may túi ba gang mang đi mà đựng.",
    "Người em làm theo lời chim dặn, được chim chở ra đảo vàng lấy đủ ba gang túi rồi trở về. Từ đó, gia đình người em no đủ và sống hiền lành, chăm chỉ như trước.",
  ],
};
