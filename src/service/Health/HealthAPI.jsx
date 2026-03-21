import instance from "../instance";

const getHealth = async () => {
  try {
    const response = await instance.get("health");
    return response.data;
  } catch (error) {
    console.error("Error getting health:", error);
    throw error;
  }
};

export default { getHealth };
