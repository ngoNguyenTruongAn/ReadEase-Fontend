import instance from "../instance";

// Content (reading materials) - ROLE_CLINICIAN
const createContent = async (
  title,
  body,
  difficulty,
  age_group,
  cover_image_url,
) => {
  const payload = {
    title,
    body,
    difficulty,
    age_group,
    cover_image_url,
  };

  try {
    const response = await instance.post("content", payload);
    return response.data;
  } catch (error) {
    console.error("Error creating content:", error);
    throw error;
  }
};

const updateContent = async (
  id,
  title,
  body,
  difficulty,
  age_group,
  cover_image_url,
) => {
  const payload = {
    title,
    body,
    difficulty,
    age_group,
    cover_image_url,
  };
  try {
    const response = await instance.put(`content/${id}`, payload);
    return response.data;
  } catch (error) {
    console.error("Error updating content:", error);
    throw error;
  }
};

const deleteContent = async (id) => {
  try {
    const response = await instance.delete(`content/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error deleting content:", error);
    throw error;
  }
};

const getContents = async () => {
  try {
    const response = await instance.get("content");
    return response.data;
  } catch (error) {
    console.error("Error getting contents:", error);
    throw error;
  }
};

const getContentById = async (id) => {
  try {
    const response = await instance.get(`content/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error getting content by id:", error);
    throw error;
  }
};

// Analytics - ROLE_CLINICIAN
const getHeatmap = async (childId, sessionId) => {
  try {
    const response = await instance.get(`analytics/${childId}/heatmap`, {
      params: { sessionId },
    });
    return response.data;
  } catch (error) {
    console.error("Error getting heatmap:", error);
    throw error;
  }
};

//xu huopng doc sach
const getTrends = async (childId, days = 7) => {
  try {
    const response = await instance.get(`analytics/${childId}/trends`, {
      params: { days },
    });
    return response.data;
  } catch (error) {
    console.error("Error getting trends:", error);
    throw error;
  }
};

//phien doc sach
const getSessionReplay = async (sessionId) => {
  try {
    const response = await instance.get(`sessions/${sessionId}/replay`);
    return response.data;
  } catch (error) {
    console.error("Error getting session replay:", error);
    throw error;
  }
};

//phien doc sach cua tre
const getChildSessions = async (childId, params = {}) => {
  try {
    const response = await instance.get(`sessions/${childId}`, { params });
    return response.data;
  } catch (error) {
    console.error("Error getting child sessions:", error);
    throw error;
  }
};

export default {
  // content
  createContent,
  updateContent,
  deleteContent,
  getContents,
  getContentById,

  // analytics
  getHeatmap,
  getTrends,

  // sessions
  getSessionReplay,
  getChildSessions,
};
