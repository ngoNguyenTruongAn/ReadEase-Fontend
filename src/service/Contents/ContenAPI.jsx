import instance from "../instance";

const unwrapPayload = (response) => response?.data?.data ?? response?.data ?? null;

const runWithFallback = async (primaryRequest, fallbackRequest) => {
  try {
    return await primaryRequest();
  } catch (primaryError) {
    if (!fallbackRequest) throw primaryError;
    try {
      return await fallbackRequest();
    } catch {
      throw primaryError;
    }
  }
};

const getReadingStories = async () => {
  try {
    const payload = await runWithFallback(
      async () => unwrapPayload(await instance.get("content")),
      async () => unwrapPayload(await instance.get("reading")),
    );
    return payload;
  } catch (error) {
    console.error("Error getting reading stories:", error);
    throw error;
  }
};

const getReadingStoryDetail = async (contentId) => {
  if (!contentId && contentId !== 0) {
    throw new Error("contentId is required to fetch reading detail.");
  }

  const id = encodeURIComponent(String(contentId));

  try {
    const payload = await runWithFallback(
      async () => unwrapPayload(await instance.get(`content/${id}`)),
      async () => unwrapPayload(await instance.get(`reading/${id}`)),
    );
    return payload;
  } catch (error) {
    console.error("Error getting reading story detail:", error);
    throw error;
  }
};

const postReadingStory = async (title, content, difficulty, ageGroup) => {
  try {
    const response = await instance.post("reading", {
      title,
      content,
      difficulty,
      ageGroup,
    });
    return response.data;
  } catch (error) {
    console.error("Error posting reading story:", error);
    throw error;
  }
};

export default { getReadingStories, getReadingStoryDetail, postReadingStory };
