import instance from "../instance";

const getReadingStories = async () => {
  try {
    const response = await instance.get("reading");
    return response.data;
  } catch (error) {
    console.error("Error getting reading stories:", error);
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

export default { getReadingStories, postReadingStory };
